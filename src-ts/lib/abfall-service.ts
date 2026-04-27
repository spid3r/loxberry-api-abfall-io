import fs from "node:fs";
import { log } from "./logger.js";
import { publishWasteData } from "./mqtt-publisher.js";
import { readMergedCronInstallProbe, resolvePaths } from "./paths.js";
import { foldForSearch } from "./fold-for-search.js";
import { getServiceMapSourceInfo, loadServiceMap, titleForServiceKey } from "./service-map.js";
import type { ApiStatus, MqttPublishStatus, PluginConfig, SearchItem, WasteData, WasteEntry } from "./types.js";

const DEFAULT_FETCH_INTERVAL_HOURS = 6;
const DEFAULT_FETCH_FUZZ_MINUTES = 30;
/** Enforced server-friendly minimum: users cannot poll the upstream more often than this (UI + config). */
export const MIN_FETCH_INTERVAL_HOURS = 6;

const API_URL = "https://api.abfall.io";

/**
 * 32-hex abfall.io service key; empty if the user has not set a region yet (no built-in default).
 */
export function configuredServiceKey(cfg: PluginConfig): string {
  return (cfg.service_key ?? "").trim().toLowerCase();
}

function normalizedFetchIntervalHours(h: number | undefined): number {
  const v = h ?? DEFAULT_FETCH_INTERVAL_HOURS;
  return Math.max(MIN_FETCH_INTERVAL_HOURS, Math.min(168, v));
}
const MODUS_KEY = "d6c5855a62cf32a4dadbc2831f0f295f";
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0";

function getPaths() {
  return resolvePaths();
}

export function loadConfig(): PluginConfig {
  const { configFile } = getPaths();
  if (!fs.existsSync(configFile)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(configFile, "utf-8")) as PluginConfig;
}

export function saveConfig(cfg: PluginConfig): void {
  const { configFile, configDir } = getPaths();
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2), "utf-8");
}

async function apiPost(
  params: Record<string, string>,
  data: Record<string, string> = {},
  timeoutMs = 30_000,
): Promise<{ text: string; status: number }> {
  const url = `${API_URL}?${new URLSearchParams(params).toString()}`;
  const body = new URLSearchParams(data);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: controller.signal,
    });
    return { text: await response.text(), status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

export function extractHiddenFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<input[^>]*type=["']hidden["'][^>]*>/gi;
  const nameRegex = /name=["']([^"']+)["']/i;
  const valueRegex = /value=["']([^"']*)["']/i;
  for (const tag of html.match(regex) ?? []) {
    const nameMatch = tag.match(nameRegex);
    if (!nameMatch) continue;
    const valueMatch = tag.match(valueRegex);
    fields[nameMatch[1]] = valueMatch ? valueMatch[1] : "";
  }
  return fields;
}

export function extractStreetOptions(html: string): SearchItem[] {
  const selectMatch = html.match(/<select[^>]*name=["'][^"']*f_id_strasse[^"']*["'][^>]*>([\s\S]*?)<\/select>/i);
  const content = selectMatch ? selectMatch[1] : html;
  const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi;
  const out: SearchItem[] = [];
  let match: RegExpExecArray | null = optionRegex.exec(content);
  while (match) {
    const id = match[1].trim();
    const name = match[2].trim();
    if (id && id !== "0" && name) {
      out.push({ id, name });
    }
    match = optionRegex.exec(content);
  }
  return out;
}

export { foldForSearch };

async function initSession(key: string): Promise<{ hiddenFields: Record<string, string>; html: string }> {
  const { text, status } = await apiPost({
    key,
    modus: MODUS_KEY,
    waction: "init",
  });
  if (status !== 200) {
    throw new Error(`API init failed with status ${status}`);
  }
  const hiddenFields = extractHiddenFields(text);
  log.info(`API init: ${Object.keys(hiddenFields).length} hidden fields, ${text.length} chars`);
  return { hiddenFields, html: text };
}

export type ServiceKeyRequiredError = { error: "service_key_required" };

export async function searchStreet(
  query: string,
  config = loadConfig(),
): Promise<SearchItem[] | ServiceKeyRequiredError> {
  const key = configuredServiceKey(config);
  if (!key) {
    return { error: "service_key_required" };
  }
  const { html } = await initSession(key);
  const options = extractStreetOptions(html);
  const q = foldForSearch(query);
  const results = options.filter((street) => foldForSearch(street.name).includes(q));
  log.info(`Street search '${query}': ${results.length} results from ${options.length} total`);
  return results;
}

export async function searchHnr(
  streetId: string,
  config = loadConfig(),
): Promise<SearchItem[] | ServiceKeyRequiredError> {
  const key = configuredServiceKey(config);
  if (!key) {
    return { error: "service_key_required" };
  }
  const { hiddenFields } = await initSession(key);
  try {
    const { text, status } = await apiPost(
      { key, modus: MODUS_KEY, waction: "street_hnr" },
      { ...hiddenFields, f_id_strasse: streetId },
    );
    if (status === 200 && text.trim()) {
      const optionRegex = /<option[^>]*value=["']([^"']+)["'][^>]*>([^<]+)/gi;
      const results: SearchItem[] = [];
      let match: RegExpExecArray | null = optionRegex.exec(text);
      while (match) {
        const id = match[1].trim();
        const name = match[2].trim();
        if (id && id !== "0") {
          results.push({ id, name });
        }
        match = optionRegex.exec(text);
      }
      if (results.length > 0) {
        log.info(`HNR for street ${streetId}: ${results.length} options`);
        return results;
      }
    }
  } catch (err) {
    log.debug(`HNR lookup failed: ${String(err)}`);
  }
  return [{ id: "__not_needed__", name: "House number selection not required" }];
}

const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** ISO-8601 weekday: Monday = 1 … Sunday = 7. */
function isoWeekdayMon1ToSun7(d: Date): number {
  const dow = d.getDay();
  return dow === 0 ? 7 : dow;
}

function localizedWeekdayName(lang: string | undefined, d: Date): string {
  const l = (lang || "en").toLowerCase();
  if (l.startsWith("de")) {
    return WEEKDAYS_DE[d.getDay()] ?? "";
  }
  return WEEKDAYS_EN[d.getDay()] ?? "";
}

export interface ParseIcsOptions {
  /** Plugin language, e.g. "de" or "en" (from config). Affects weekday names only. */
  language?: string;
}

export function parseIcs(icsText: string, options?: ParseIcsOptions): Record<string, WasteEntry> {
  const lang = options?.language;
  const now = new Date();
  const out: Record<string, WasteEntry> = {};
  let currentSummary = "";
  let currentDate: Date | null = null;

  for (const lineRaw of icsText.split("\n")) {
    const line = lineRaw.trim();
    if (line.startsWith("SUMMARY:")) {
      currentSummary = line.slice(8).trim();
    } else if (line.startsWith("DTSTART")) {
      const dateStr = line.split(":").at(-1)?.trim() ?? "";
      if (/^\d{8}$/.test(dateStr)) {
        const year = Number(dateStr.slice(0, 4));
        const month = Number(dateStr.slice(4, 6)) - 1;
        const day = Number(dateStr.slice(6, 8));
        currentDate = new Date(year, month, day);
      } else {
        currentDate = null;
      }
    } else if (line === "END:VEVENT") {
      if (currentSummary && currentDate) {
        const currentDateDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffMs = currentDateDay.getTime() - nowDay.getTime();
        const daysUntil = Math.floor(diffMs / (24 * 3600 * 1000));
        if (daysUntil >= 0) {
          const safeName = currentSummary.replace(/[^a-zA-ZäöüÄÖÜß0-9 -]/g, "").trim();
          const wochentag = localizedWeekdayName(lang, currentDate);
          const wochentagNum = isoWeekdayMon1ToSun7(currentDate);
          const entry: WasteEntry = {
            tage: daysUntil,
            datum: `${String(currentDate.getDate()).padStart(2, "0")}.${String(currentDate.getMonth() + 1).padStart(2, "0")}.${currentDate.getFullYear()}`,
            wochentag,
            wochentag_num: wochentagNum,
          };
          if (!out[safeName] || daysUntil < out[safeName].tage) {
            out[safeName] = entry;
          }
        }
      }
      currentSummary = "";
      currentDate = null;
    }
  }
  log.info(`Parsed ICS: ${Object.keys(out).length} upcoming categories`);
  return out;
}

/**
 * If categories_filter in config is non-empty, only keep those category keys
 * (name match after {@link foldForSearch}; empty / missing filter = all).
 */
export function pickFilteredTermine(
  termine: Record<string, WasteEntry>,
  filter: string[] | undefined,
): Record<string, WasteEntry> {
  if (!filter || filter.length === 0) {
    return termine;
  }
  const want = new Set(
    filter.map((s) => foldForSearch(s)).filter((s) => s.length > 0),
  );
  return Object.fromEntries(
    Object.entries(termine).filter(([name]) => want.has(foldForSearch(name))),
  );
}

function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function inferKommuneFromStreetId(streetId: string): string {
  const match = /^(\d+)/.exec(streetId);
  return match ? match[1] : "";
}

export async function fetchData(config = loadConfig()): Promise<WasteData> {
  const loc = config.location ?? {};
  const key = configuredServiceKey(config);
  if (!key) {
    throw new Error(
      "No service key configured. In the admin UI, open Settings, choose your waste region (or enter the 32-character key), save, then set your address on the Location tab.",
    );
  }
  let fIdKommune = loc.f_id_kommune ?? "";
  const fIdStrasse = loc.f_id_strasse ?? "";
  const fIdStrasseHnr = loc.f_id_strasse_hnr ?? "";

  if (!fIdStrasse) {
    throw new Error("No street configured. Please set up location first.");
  }
  if (!fIdKommune) {
    fIdKommune = inferKommuneFromStreetId(fIdStrasse);
    if (!fIdKommune) {
      throw new Error("No municipality ID configured. Please save a location that includes a municipality.");
    }
  }

  const { hiddenFields } = await initSession(key);
  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 3600 * 1000);
  const dateKey = (d: Date): string =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  const args: Record<string, string> = {
    ...hiddenFields,
    f_id_kommune: fIdKommune,
    f_id_strasse: fIdStrasse,
    f_zeitraum: `${dateKey(now)}-${dateKey(oneYear)}`,
    f_abfallarten_index_max: "0",
    f_abfallarten: "",
  };
  if (fIdStrasseHnr && fIdStrasseHnr !== "__not_needed__") {
    args.f_id_strasse_hnr = fIdStrasseHnr;
  }

  log.info(`Fetching ICS data: kommune=${fIdKommune}, strasse=${fIdStrasse}, hnr=${fIdStrasseHnr || "(none)"}`);
  const { text, status } = await apiPost(
    { key, modus: MODUS_KEY, waction: "export_ics" },
    args,
  );
  if (status !== 200) {
    throw new Error(`ICS export failed with status ${status}`);
  }
  if (!text.includes("VCALENDAR")) {
    throw new Error(`Response is not ICS data: ${text.slice(0, 200)}`);
  }

  const rawTermine = parseIcs(text, { language: config.language });
  const termine = pickFilteredTermine(rawTermine, config.categories_filter);
  if (Object.keys(termine).length === 0 && Object.keys(rawTermine).length > 0) {
    log.warn(
      `Category filter excluded all ${Object.keys(rawTermine).length} ICS categories; cache will be empty until the filter matches names in the feed.`,
    );
  }
  const streetName = loc.street_name ?? `Street ${fIdStrasse}`;
  const hnrName = loc.hnr_name ?? "";
  const location = `${streetName} ${hnrName}`.trim();
  const intervalHours = normalizedFetchIntervalHours(config.fetch_interval_hours);
  const fuzzMinutes = Math.max(0, config.fetch_fuzz_minutes ?? DEFAULT_FETCH_FUZZ_MINUTES);
  const offsetMinutes = fuzzMinutes === 0 ? 0 : Math.round((Math.random() * 2 - 1) * fuzzMinutes);
  const dueAt = new Date(Date.now() + intervalHours * 3600 * 1000 + offsetMinutes * 60 * 1000);

  const result: WasteData = {
    timestamp: nowTimestamp(),
    standort: location,
    location,
    termine: Object.fromEntries(
      Object.entries(termine).sort((a, b) => a[1].tage - b[1].tage),
    ),
    next_fetch_due: formatTimestamp(dueAt),
    next_fetch_offset_minutes: offsetMinutes,
  };

  const { cacheFile, dataDir } = getPaths();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf-8");
  log.info(
    `Data cached to ${cacheFile} (${Object.keys(termine).length} categories), ` +
      `next due ${result.next_fetch_due} (offset ${offsetMinutes}min)`,
  );

  if (config.mqtt?.enabled) {
    const status = await publishWasteData({ config: config.mqtt, data: result });
    result.mqtt = status;
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf-8");
  }

  return result;
}

function formatTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function getStatus(): ApiStatus {
  const cfg = loadConfig();
  const loc = cfg.location ?? {};
  const { cacheFile } = getPaths();
  let cachedData: Partial<WasteData> | Record<string, never> = {};
  if (fs.existsSync(cacheFile)) {
    cachedData = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as Partial<WasteData>;
  }
  const cached = cachedData as Partial<WasteData>;
  const mqttStatus: MqttPublishStatus = cached.mqtt ?? { ok: false, last: "" };

  const sm = getServiceMapSourceInfo();
  const key = configuredServiceKey(cfg);
  const has_region = key.length > 0;
  const map = loadServiceMap();
  const region_title = has_region
    ? titleForServiceKey(key, map) ?? `${key.slice(0, 8)}…`
    : "";
  const strasse = String(loc.f_id_strasse ?? "").trim();
  const has_street = strasse !== "";
  return {
    cookie_status: "not_needed",
    cookie_created: "",
    cookie_expires: "",
    client_id: "(api.abfall.io - no registration)",
    last_fetch: cached.timestamp ?? "",
    next_fetch_due: cached.next_fetch_due ?? "",
    location: `${loc.street_name ?? ""} ${loc.hnr_name ?? ""}`.trim(),
    has_region,
    region_title,
    has_street,
    location_api: cached.standort ?? "",
    termine_count: Object.keys(cached.termine ?? {}).length,
    cached_data: cachedData,
    /** Single upstream; value is for display. Schedules are fetched as an ICS calendar in the background. */
    api_mode: "api.abfall.io",
    mqtt: mqttStatus,
    install_cron: readMergedCronInstallProbe(),
    service_map: { source: sm.source, count: sm.count },
    service_key_configured: configuredServiceKey(cfg) !== "",
  };
}

export function getLog(lines = 100): string {
  const { logFile } = getPaths();
  if (!fs.existsSync(logFile)) return "";
  const allLines = fs.readFileSync(logFile, "utf-8").split(/\r?\n/);
  return `${allLines.slice(-lines).join("\n")}\n`.trim();
}

export function clearLog(): void {
  const { logFile, logDir } = getPaths();
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(logFile, "", "utf-8");
}

export function shouldFetch(config: PluginConfig, force: boolean, now: Date = new Date()): boolean {
  if (force) {
    return true;
  }
  if (!configuredServiceKey(config) || !config.location?.f_id_strasse) {
    return false;
  }
  const { cacheFile } = getPaths();
  if (!fs.existsSync(cacheFile)) {
    return true;
  }
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as Partial<WasteData>;
    const lastTs = cached.timestamp ?? "";
    if (!lastTs) return true;
    const lastDate = new Date(lastTs.replace(" ", "T"));
    const intervalHours = normalizedFetchIntervalHours(config.fetch_interval_hours);
    const fuzzMinutes = Math.max(0, config.fetch_fuzz_minutes ?? DEFAULT_FETCH_FUZZ_MINUTES);
    const offsetMinutes = cached.next_fetch_offset_minutes ?? 0;
    const dueAt = new Date(
      lastDate.getTime() + intervalHours * 3600 * 1000 + offsetMinutes * 60 * 1000,
    );
    if (now.getTime() < dueAt.getTime()) {
      const minutesRemaining = Math.round((dueAt.getTime() - now.getTime()) / 60000);
      log.info(
        `Skipping fetch: last=${lastTs}, interval=${intervalHours}h, fuzz=±${fuzzMinutes}min, ` +
          `offset=${offsetMinutes}min, next due in ~${minutesRemaining} min`,
      );
      return false;
    }
  } catch {
    return true;
  }
  return true;
}
