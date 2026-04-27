import fs from "node:fs";
import path from "node:path";
import { foldForSearch } from "./fold-for-search.js";
import { resolvePaths } from "./paths.js";
import type { ResolvedPaths } from "./paths.js";

/**
 * Region list derived from the Home Assistant community
 * `waste_collection_schedule` / `AbfallIO` SERVICE_MAP
 * (see `data/abfallio-service-map.json` upstream: mampfes/hacs_waste_collection_schedule).
 */
export interface ServiceMapEntry {
  title: string;
  url: string;
  service_id: string;
}

export type ServiceRegionSearchItem = {
  id: string;
  name: string;
  title: string;
  url: string;
};

let cached: ServiceMapEntry[] | null = null;

/**
 * A user `abfallio-service-map.json` in plugindata (from “Update region list online”)
 * augments and overrides the bundled `data/abfallio-service-map.json` by `service_id`.
 * Entries only present in the bundled file remain available — so a stale or small user file
 * does not remove regions.
 */
export function resolveServiceMapReadPath(p: ResolvedPaths = resolvePaths()): string | null {
  const user = path.join(p.dataDir, "abfallio-service-map.json");
  const bundled = p.serviceMapBundledFile;
  if (fs.existsSync(user)) {
    return user;
  }
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  return null;
}

export function getServiceMapSourceInfo(p: ResolvedPaths = resolvePaths()): {
  source: "user" | "bundled" | "none";
  path: string;
  count: number;
} {
  const user = path.join(p.dataDir, "abfallio-service-map.json");
  const bundled = p.serviceMapBundledFile;
  const count = loadServiceMap().length;
  const samePath = path.resolve(user) === path.resolve(bundled);
  if (fs.existsSync(user)) {
    if (samePath) {
      return { source: "bundled", path: user, count };
    }
    return { source: "user", path: user, count };
  }
  if (fs.existsSync(bundled)) {
    return { source: "bundled", path: bundled, count };
  }
  return { source: "none", path: "", count: 0 };
}

function normalizeMapRow(row: unknown): ServiceMapEntry | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const r = row as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title : "";
  const url = typeof r.url === "string" ? r.url : "";
  const service_id = typeof r.service_id === "string" ? r.service_id : "";
  if (!service_id || !title) {
    return null;
  }
  return { title, url, service_id };
}

function readMapFileRows(file: string): ServiceMapEntry[] {
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown;
    if (!Array.isArray(raw)) {
      return [];
    }
    const out: ServiceMapEntry[] = [];
    for (const item of raw) {
      const e = normalizeMapRow(item);
      if (e) {
        out.push(e);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Merged: all bundled `service_id`s, overridden or extended by the user file (GitHub refresh). */
export function mergeServiceMapEntries(
  bundledRows: ServiceMapEntry[],
  userRows: ServiceMapEntry[],
): ServiceMapEntry[] {
  const byId = new Map<string, ServiceMapEntry>();
  for (const row of bundledRows) {
    byId.set(row.service_id.toLowerCase(), row);
  }
  for (const row of userRows) {
    byId.set(row.service_id.toLowerCase(), row);
  }
  return [...byId.values()];
}

export function loadServiceMap(): ServiceMapEntry[] {
  if (cached) {
    return cached;
  }
  const p = resolvePaths();
  const bundledRows = readMapFileRows(p.serviceMapBundledFile);
  const userPath = path.join(p.dataDir, "abfallio-service-map.json");
  const userRows = readMapFileRows(userPath);
  cached = mergeServiceMapEntries(bundledRows, userRows);
  return cached;
}

/** Used by CLI / tests. */
export function clearServiceMapCacheForTests(): void {
  cached = null;
}

export function searchServiceRegions(
  query: string,
  limit = 30,
  map: ServiceMapEntry[] = loadServiceMap(),
): ServiceRegionSearchItem[] {
  const q = foldForSearch(query.trim());
  if (q.length < 2) {
    return [];
  }
  const scored: { row: ServiceMapEntry; score: number }[] = [];
  for (const row of map) {
    const t = foldForSearch(row.title);
    const u = foldForSearch(row.url || "");
    const it = t.indexOf(q);
    const iu = u.indexOf(q);
    const inT = it >= 0;
    const inU = iu >= 0;
    if (!inT && !inU) {
      continue;
    }
    // Lower score = earlier / more relevant. Prefer title matches; url matches get +5000.
    let score = 1_000_000;
    if (inT) {
      score = Math.min(score, it);
    }
    if (inU) {
      score = Math.min(score, iu + 5000);
    }
    scored.push({ row, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map(({ row }) => ({
    id: row.service_id,
    name: row.title,
    title: row.title,
    url: row.url,
  }));
}

export function titleForServiceKey(key: string, map: ServiceMapEntry[] = loadServiceMap()): string | null {
  const k = key.trim().toLowerCase();
  if (k.length === 0) {
    return null;
  }
  for (const row of map) {
    if (row.service_id.toLowerCase() === k) {
      return row.title;
    }
  }
  return null;
}
