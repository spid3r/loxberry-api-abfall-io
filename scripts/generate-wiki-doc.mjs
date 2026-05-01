import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const TEMPLATE_PATH = path.join(root, "docs", "templates", "wiki.dokuwiki.tpl");
const CHANGELOG_PATH = path.join(root, "CHANGELOG.md");
const SERVICE_MAP_PATH = path.join(root, "data", "abfallio-service-map.json");
const OUTPUT_PATH = path.join(root, "docs", "WIKI_DOKUWIKI_START.txt");
const SCREENSHOT_BASE =
  "https://raw.githubusercontent.com/spid3r/loxberry-api-abfall-io/main/docs/wiki-assets";

export function parseVersionsFromChangelog(changelog, maxVersions = 5) {
  const lines = changelog.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##?\s+\[?(\d+\.\d+\.\d+)\]?\s*/);
    if (m) {
      if (current) sections.push(current);
      current = { version: m[1], bullets: [] };
      continue;
    }
    if (!current) continue;
    const b = line.match(/^\*\s+(.+)/);
    if (b) {
      const text = b[1]
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`/g, "''")
        .trim();
      if (text) current.bullets.push(text);
    }
  }
  if (current) sections.push(current);
  return sections.slice(0, maxVersions);
}

export function renderVersionHistory(changelogText) {
  const versions = parseVersionsFromChangelog(changelogText);
  if (versions.length === 0) {
    return "**Version History nicht verfügbar**\n\n  * Bitte CHANGELOG.md prüfen.";
  }
  const out = [];
  for (const v of versions) {
    out.push(`**Version ${v.version}**`);
    out.push("");
    if (v.bullets.length === 0) {
      out.push("  * Details siehe CHANGELOG.md");
    } else {
      for (const b of v.bullets.slice(0, 8)) {
        out.push(`  * ${b}`);
      }
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  const serviceId = typeof entry.service_id === "string" ? entry.service_id.trim().toLowerCase() : "";
  if (!title || !url || !/^[a-f0-9]{32}$/.test(serviceId)) return null;
  return { title, url, service_id: serviceId };
}

export function parseAndSortRegions(jsonText) {
  const rows = JSON.parse(jsonText);
  if (!Array.isArray(rows)) throw new Error("Service map is not an array.");
  const byId = new Map();
  for (const row of rows) {
    const normalized = normalizeEntry(row);
    if (!normalized) continue;
    byId.set(normalized.service_id, normalized);
  }
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, "de"));
}

export function renderRegionList(entries) {
  if (entries.length === 0) {
    return "  * Keine Regionen verfügbar.";
  }
  return entries
    .map((entry) => `  * [[${entry.url}|${entry.title}]] (Service-ID: ''${entry.service_id}'')`)
    .join("\n");
}

export function generateWikiDoc({ templateText, changelogText, serviceMapText }) {
  const versions = renderVersionHistory(changelogText);
  const regions = parseAndSortRegions(serviceMapText);
  const regionsList = renderRegionList(regions);

  const screenshotGallery = [
    "  * Übersicht / Status:",
    `{{${SCREENSHOT_BASE}/abfallio-status-de.jpg?900|Plugin Status (Deutsch)}}`,
    "",
    "  * Standort / Regions- und Straßensuche:",
    `{{${SCREENSHOT_BASE}/abfallio-location-de.jpg?900|Plugin Standort (Deutsch)}}`,
    "",
    "  * Einstellungen (inkl. MQTT):",
    `{{${SCREENSHOT_BASE}/abfallio-settings-de.jpg?900|Plugin Einstellungen (Deutsch)}}`,
  ].join("\n");

  return templateText
    .replaceAll("{{VERSION_HISTORY}}", versions)
    .replaceAll("{{SUPPORTED_REGION_COUNT}}", String(regions.length))
    .replaceAll("{{SUPPORTED_REGIONS_LIST}}", regionsList)
    .replaceAll("{{SCREENSHOT_GALLERY}}", screenshotGallery);
}

export function run() {
  const templateText = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const changelogText = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const serviceMapText = fs.readFileSync(SERVICE_MAP_PATH, "utf-8");
  const out = generateWikiDoc({ templateText, changelogText, serviceMapText });
  fs.writeFileSync(OUTPUT_PATH, `${out.trimEnd()}\n`, "utf-8");
  console.log(`Generated ${path.relative(root, OUTPUT_PATH)} with ${parseAndSortRegions(serviceMapText).length} regions.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run();
}
