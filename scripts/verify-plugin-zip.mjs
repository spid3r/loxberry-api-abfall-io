/**
 * Fails the build if the release ZIP is missing LoxBerry-required files or
 * includes obvious dev-only paths (src-ts, node_modules, tests, etc.).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginCfg = path.join(root, "plugin.cfg");

function readVersion() {
  const c = fs.readFileSync(pluginCfg, "utf-8");
  const line = c.split(/\r?\n/).find((l) => l.startsWith("VERSION="));
  return line ? line.split("=")[1].trim() : "0.0.0";
}

const version = readVersion();
const zipPath = path.join(
  root,
  "dist",
  `loxberry-plugin-wasteapiio-${version}.zip`,
);

if (!fs.existsSync(zipPath)) {
  console.error(`ZIP not found: ${zipPath} (run npm run release:zip first)`);
  process.exit(1);
}

const list = (() => {
  const a = spawnSync("tar", ["-tf", zipPath], { encoding: "utf-8" });
  if (a.status !== 0) {
    console.error("Could not list ZIP (is `tar` available?)", a.stderr);
    process.exit(1);
  }
  return a.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
})();

const forbidden = [
  /(^|\/)node_modules\//i,
  /(^|\/)src-ts\//i,
  /(^|\/)test-ts\//i,
  /(^|\/)test-e2e\//i,
  /(^|\/)scripts\//i,
  /(^|\/)\.github\//i,
  /(^|\/)\.git\//i,
  /playwright\.config/i,
  /^package\.json$/i,
  /^package-lock\.json$/i,
  /tsconfig\.json$/i,
  /\.env$/i,
];

const bad = [];
for (const entry of list) {
  for (const rx of forbidden) {
    if (rx.test(entry)) {
      bad.push({ entry, rx: rx.toString() });
    }
  }
}
if (bad.length) {
  console.error("ZIP contains disallowed dev paths:\n" + bad.map((b) => `  - ${b.entry} (${b.rx})`).join("\n"));
  process.exit(1);
}

const mustHave = [
  "plugin.cfg",
  "preinstall.sh",
  "postinstall.sh",
  "bin/abfall_api.cjs",
  "bin/fetch.cjs",
  "webfrontend/htmlauth/index.php",
  "webfrontend/htmlauth/ajax.php",
  "webfrontend/html/loxone.php",
  "webfrontend/html/index.php",
  "webfrontend/html/waste_data_paths.php",
  "templates/lang/language_en.ini",
  "templates/lang/language_de.ini",
  "config/abfall.json",
  "cron/crontab",
  "icons/icon_64.png",
];

const missing = mustHave.filter((f) => !list.includes(f));
if (missing.length) {
  console.error("ZIP missing required plugin files:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  process.exit(1);
}

if (!list.includes("bin/dist-node/cli/abfall_api.cjs") || !list.includes("bin/dist-node/cli/fetch.cjs")) {
  console.error("ZIP missing embedded dist-node bundle under bin/dist-node/cli/");
  process.exit(1);
}

console.log(`OK: ${path.basename(zipPath)} (${list.length} entries) — LoxBerry layout is sane, no dev junk.`);
