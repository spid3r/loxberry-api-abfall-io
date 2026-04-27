import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.js";
import type { MqttConfig, MqttPublishStatus, WasteData } from "./types.js";

export interface ResolvedBroker {
  host: string;
  port: number;
  user: string;
  password: string;
  source: string;
}

const DEFAULT_PREFIX = "loxberry/abfallio";

function nowTs(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Try to read LoxBerry's built-in MQTT broker credentials. LoxBerry 3 stores
 * the active MQTT broker config in `${LBHOMEDIR}/config/system/general.json`
 * under the "Mqtt" key. Older versions used several other locations as well,
 * which we still probe as a fallback. Returns the first match or null.
 */
export function loadLoxBerryBrokerCredentials(lbhomedir: string): ResolvedBroker | null {
  if (!lbhomedir) return null;

  const generalJson = path.join(lbhomedir, "config", "system", "general.json");
  try {
    if (fs.existsSync(generalJson)) {
      const raw = JSON.parse(fs.readFileSync(generalJson, "utf-8")) as Record<string, unknown>;
      const mqtt = (raw.Mqtt ?? raw.mqtt ?? raw.MQTT) as Record<string, unknown> | undefined;
      if (mqtt && typeof mqtt === "object") {
        const broker = readBrokerFields(mqtt);
        if (broker) {
          return { ...broker, source: generalJson };
        }
      }
    }
  } catch (err) {
    log.debug(`Could not parse ${generalJson}: ${String(err)}`);
  }

  const credentialFiles = [
    path.join(lbhomedir, "system", "storage", "mqtt", "cred.json"),
    path.join(lbhomedir, "data", "system", "storage", "mqtt", "cred.json"),
    path.join(lbhomedir, "data", "system", "mqtt", "cred.json"),
    path.join(lbhomedir, "data", "plugins", "mqttgateway", "cred.json"),
    path.join(lbhomedir, "config", "plugins", "mqttgateway", "cred.json"),
  ];
  for (const file of credentialFiles) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
      const broker =
        readBrokerFields(raw) ??
        readBrokerFields((raw.Mqtt ?? raw.mqtt ?? {}) as Record<string, unknown>);
      if (broker) {
        return { ...broker, source: file };
      }
    } catch (err) {
      log.debug(`Could not parse ${file}: ${String(err)}`);
    }
  }

  for (const cfg of [
    path.join(lbhomedir, "config", "system", "general.cfg"),
    path.join(lbhomedir, "system", "general.cfg"),
  ]) {
    try {
      if (!fs.existsSync(cfg)) continue;
      const text = fs.readFileSync(cfg, "utf-8");
      const section = parseIniSection(text, "MQTT") ?? parseIniSection(text, "Mqtt");
      if (section) {
        const broker = readBrokerFields(section);
        if (broker) {
          return { ...broker, source: cfg };
        }
      }
    } catch (err) {
      log.debug(`Could not read ${cfg}: ${String(err)}`);
    }
  }

  return null;
}

function readBrokerFields(raw: Record<string, unknown>): Omit<ResolvedBroker, "source"> | null {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    lower[k.toLowerCase()] = v;
  }
  const hostRaw = lower.brokerhost ?? lower.host ?? lower.brokeraddress;
  if (!hostRaw) return null;
  let host = String(hostRaw);
  let port = Number(lower.brokerport ?? lower.port ?? 1883);
  if (host.includes(":")) {
    const [h, p] = host.split(":");
    host = h;
    if (p) port = Number(p);
  }
  if (!Number.isFinite(port)) port = 1883;
  const user = String(lower.brokeruser ?? lower.user ?? "");
  const password = String(lower.brokerpass ?? lower.pass ?? lower.password ?? "");
  return { host, port, user, password };
}

function parseIniSection(text: string, section: string): Record<string, string> | null {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const out: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inSection = line.toLowerCase() === `[${section.toLowerCase()}]`;
      continue;
    }
    if (!inSection || line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface MqttPublishOptions {
  config: MqttConfig;
  data: WasteData;
  lbhomedir?: string;
  /**
   * Allows tests to inject a fake mqtt connection. Must accept the resolved options
   * (host, port, user, password) and return an object exposing publish + end methods.
   */
  connect?: (opts: ConnectArgs) => Promise<MqttClientLike>;
}

export interface ConnectArgs {
  host: string;
  port: number;
  user: string;
  password: string;
  clientId: string;
}

export interface MqttClientLike {
  publish(topic: string, payload: string, options: { retain: boolean; qos: 0 | 1 | 2 }): Promise<void>;
  end(): Promise<void>;
}

export function safeTopicSegment(value: string): string {
  if (!value) return "unknown";
  const stripped = value
    .replace(/ä/g, "ae")
    .replace(/Ä/g, "Ae")
    .replace(/ö/g, "oe")
    .replace(/Ö/g, "Oe")
    .replace(/ü/g, "ue")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return stripped !== "" ? stripped.toLowerCase() : "unknown";
}

export function buildPublishMessages(
  prefix: string,
  data: WasteData,
): { topic: string; payload: string }[] {
  const safePrefix = prefix.replace(/\/+$/g, "");
  const messages: { topic: string; payload: string }[] = [];
  messages.push({ topic: `${safePrefix}/state`, payload: JSON.stringify(data) });
  messages.push({ topic: `${safePrefix}/last_fetch`, payload: data.timestamp });
  messages.push({ topic: `${safePrefix}/location`, payload: data.location });
  messages.push({
    topic: `${safePrefix}/categories_count`,
    payload: String(Object.keys(data.termine).length),
  });
  for (const [name, entry] of Object.entries(data.termine)) {
    const slug = safeTopicSegment(name);
    const base = `${safePrefix}/categories/${slug}`;
    messages.push({ topic: `${base}/days`, payload: String(entry.tage) });
    messages.push({ topic: `${base}/date`, payload: entry.datum });
    messages.push({ topic: `${base}/weekday`, payload: entry.wochentag });
    messages.push({
      topic: `${base}/weekday_num`,
      payload: String(entry.wochentag_num ?? 0),
    });
    messages.push({ topic: `${base}/category`, payload: name });
  }
  return messages;
}

export async function publishWasteData(
  options: MqttPublishOptions,
): Promise<MqttPublishStatus> {
  const { config, data } = options;
  if (!config.enabled) {
    return { ok: false, last: nowTs(), message: "MQTT disabled" };
  }

  let host = (config.host ?? "").trim();
  let port = Number(config.port ?? 1883);
  let user = config.user ?? "";
  let password = config.password ?? "";
  let source = "manual";

  if (config.use_loxberry_broker !== false) {
    const lbhome = options.lbhomedir ?? process.env.LBHOMEDIR ?? "/opt/loxberry";
    const detected = loadLoxBerryBrokerCredentials(lbhome);
    if (detected) {
      if (!host) host = detected.host;
      if (!port || !Number.isFinite(port)) port = detected.port;
      if (!user) user = detected.user;
      if (!password) password = detected.password;
      source = detected.source;
    }
  }
  if (!host) host = "127.0.0.1";
  if (!Number.isFinite(port) || port <= 0) port = 1883;

  const prefix = config.topic_prefix?.trim() || DEFAULT_PREFIX;
  const messages = buildPublishMessages(prefix, data);

  const clientId = `abfallio_${Math.random().toString(16).slice(2, 10)}`;
  const connect = options.connect ?? defaultConnect;
  const broker = `mqtt://${host}:${port}`;
  let client: MqttClientLike | null = null;
  try {
    client = await connect({ host, port, user, password, clientId });
    for (const msg of messages) {
      await client.publish(msg.topic, msg.payload, {
        retain: config.retain !== false,
        qos: 1,
      });
    }
    log.info(
      `MQTT published ${messages.length} topics to ${broker} (prefix='${prefix}', source=${source})`,
    );
    return {
      ok: true,
      last: nowTs(),
      topics_published: messages.length,
      broker,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`MQTT publish failed (${broker}): ${message}`);
    return {
      ok: false,
      last: nowTs(),
      message,
      broker,
    };
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore close errors
      }
    }
  }
}

async function defaultConnect(args: ConnectArgs): Promise<MqttClientLike> {
  const mqttModule = (await import("mqtt")) as unknown as {
    connectAsync: (
      url: string,
      opts?: { username?: string; password?: string; clientId?: string; connectTimeout?: number },
    ) => Promise<{
      publishAsync: (topic: string, payload: string, opts: { retain: boolean; qos: 0 | 1 | 2 }) => Promise<unknown>;
      endAsync: (force?: boolean) => Promise<void>;
    }>;
  };
  const url = `mqtt://${args.host}:${args.port}`;
  const native = await mqttModule.connectAsync(url, {
    username: args.user || undefined,
    password: args.password || undefined,
    clientId: args.clientId,
    connectTimeout: 8000,
  });
  return {
    publish: async (topic, payload, opts) => {
      await native.publishAsync(topic, payload, opts);
    },
    end: async () => {
      await native.endAsync(false);
    },
  };
}
