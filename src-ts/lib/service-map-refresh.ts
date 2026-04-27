import fs from "node:fs";
import path from "node:path";
import { log } from "./logger.js";
import { resolvePaths } from "./paths.js";
import { clearServiceMapCacheForTests, type ServiceMapEntry } from "./service-map.js";
import type { PluginConfig } from "./types.js";

/** Same list as in Home Assistant `waste_collection_schedule` / `AbfallIO` (mampfes/hacs_waste_collection_schedule). */
export const DEFAULT_SERVICE_MAP_SOURCE_URL =
  "https://raw.githubusercontent.com/mampfes/hacs_waste_collection_schedule/master/custom_components/waste_collection_schedule/waste_collection_schedule/service/AbfallIO.py";

const FETCH_TIMEOUT_MS = 45_000;

function isHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Only https URLs, host allowlist (avoids open redirect / SSRF to internal addresses).
 * Custom `service_map_url` in abfall.json must use one of these hosts.
 */
export function isAllowedServiceMapUrl(href: string): boolean {
  if (!isHttpsUrl(href)) {
    return false;
  }
  const host = new URL(href).hostname;
  if (host === "raw.githubusercontent.com" || host === "github.com" || host === "www.github.com") {
    return true;
  }
  if (host.endsWith(".githubusercontent.com") && host.includes("github")) {
    return true;
  }
  return false;
}

/**
 * Parse `AbfallIO.py` body (SERVICE_MAP = [ { "title", "url", "service_id" }, ... ]).
 */
export function parseServiceMapFromAbfallIoPy(source: string): ServiceMapEntry[] {
  if (!source.includes("SERVICE_MAP")) {
    return [];
  }
  const out: ServiceMapEntry[] = [];
  const re =
    /"title"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"url"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"service_id"\s*:\s*"([a-fA-F0-9]{32})"/g;
  let m: RegExpExecArray | null = re.exec(source);
  while (m !== null) {
    const title = m[1].replace(/\\"/g, '"');
    const url = m[2].replace(/\\"/g, '"');
    const service_id = m[3].toLowerCase();
    if (title && url && service_id.length === 32) {
      out.push({ title, url, service_id });
    }
    m = re.exec(source);
  }
  return out;
}

/** Exported for unit tests. */
export function parseServiceMapText(body: string): ServiceMapEntry[] {
  const t = body.trim();
  if (t.startsWith("[")) {
    const arr = JSON.parse(t) as ServiceMapEntry[];
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr.filter(
      (r) =>
        r &&
        typeof r.title === "string" &&
        typeof r.url === "string" &&
        typeof r.service_id === "string" &&
        /^[a-fA-F0-9]{32}$/.test(r.service_id),
    );
  }
  return parseServiceMapFromAbfallIoPy(body);
}

export interface RefreshServiceMapResult {
  success: boolean;
  count?: number;
  source_url?: string;
  user_path?: string;
  error?: string;
}

export async function fetchServiceMapBody(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      headers: { "User-Agent": "loxberry-api-abfall-io/1.0 (region list refresh)" },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Download upstream list, validate, write to `{dataDir}/abfallio-service-map.json` (LoxBerry user data, writable).
 */
export async function refreshServiceMapToUserFile(
  cfg: PluginConfig,
  explicitUrl?: string,
): Promise<RefreshServiceMapResult> {
  const href = (explicitUrl || cfg.service_map_url || DEFAULT_SERVICE_MAP_SOURCE_URL).trim();
  if (!isAllowedServiceMapUrl(href)) {
    return { success: false, error: "URL not allowed (use https and a github.com / GitHub raw host)" };
  }
  let body: string;
  try {
    body = await fetchServiceMapBody(href);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`Service map download failed: ${msg}`);
    return { success: false, error: msg, source_url: href };
  }
  let entries: ServiceMapEntry[] = [];
  try {
    entries = parseServiceMapText(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Parse failed: ${msg}`, source_url: href };
  }
  if (entries.length < 1) {
    return { success: false, error: "No regions parsed from source", source_url: href };
  }
  const { dataDir } = resolvePaths();
  fs.mkdirSync(dataDir, { recursive: true });
  const userPath = path.join(dataDir, "abfallio-service-map.json");
  fs.writeFileSync(userPath, JSON.stringify(entries, null, 2), "utf-8");
  clearServiceMapCacheForTests();
  log.info(`Service map written: ${userPath} (${entries.length} entries) from ${href}`);
  return { success: true, count: entries.length, source_url: href, user_path: userPath };
}
