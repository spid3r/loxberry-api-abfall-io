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
  `loxberry-plugin-abfallio-${version}.zip`,
);

if (!fs.existsSync(zipPath)) {
  console.error(`ZIP not found: ${zipPath} (run npm run release:zip first)`);
  process.exit(1);
}

function listZipEntries(archivePath) {
  /** Info-ZIP on Linux/macOS CI understands Node/archiver zips; GNU tar often does not. */
  const fromStdout = (stdout) =>
    stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  const tryUnzipZ1 = () =>
    spawnSync("unzip", ["-Z1", archivePath], { encoding: "utf-8" });
  const tryTarTf = () =>
    spawnSync("tar", ["-tf", archivePath], { encoding: "utf-8" });
  // Windows: prefer built-in tar; other platforms: unzip -Z1 first
  if (process.platform === "win32") {
    const t = tryTarTf();
    if (t.status === 0) return fromStdout(t.stdout);
    const u = tryUnzipZ1();
    if (u.status === 0) return fromStdout(u.stdout);
    console.error("Could not list ZIP (tried `tar -tf`, `unzip -Z1`)", t.stderr, u.stderr);
    process.exit(1);
  }
  const u = tryUnzipZ1();
  if (u.status === 0) return fromStdout(u.stdout);
  const t = tryTarTf();
  if (t.status === 0) return fromStdout(t.stdout);
  console.error("Could not list ZIP (tried `unzip -Z1`, `tar -tf`)", u.stderr, t.stderr);
  process.exit(1);
}

const list = listZipEntries(zipPath);

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
  "postroot.sh",
  "bin/patch_cron_loxberry.sh",
  "bin/abfall_api.cjs",
  "bin/fetch.cjs",
  "webfrontend/htmlauth/index.php",
  "webfrontend/htmlauth/ajax.php",
  "webfrontend/htmlauth/icon_64.png",
  "webfrontend/html/loxone.php",
  "webfrontend/html/index.php",
  "webfrontend/html/waste_data_paths.php",
  "webfrontend/html/icon_64.png",
  "templates/lang/language_en.ini",
  "templates/lang/language_de.ini",
  "cron/crontab",
  "icons/icon_64.png",
  "icons/icon_128.png",
  "icons/icon_256.png",
  "icons/icon_512.png",
];

/** Built locally for README / previews; must not ship inside the appliance ZIP. */
const disallowedInZip = [
  /^icons\/icon_source.*\.svg$/i,
  /^icons\/icon_with_text_\d+\.png$/i,
];

const missing = mustHave.filter((f) => !list.includes(f));
if (missing.length) {
  console.error("ZIP missing required plugin files:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  process.exit(1);
}

if (list.includes("config/abfall.json")) {
  console.error(
    "ZIP must not ship config/abfall.json — LoxBerry would overwrite userdata $LBHOMEDIR/config/plugins/<plugin>/abfall.json on upgrade.",
  );
  process.exit(1);
}

const leaked = list.filter((e) => disallowedInZip.some((rx) => rx.test(e)));
if (leaked.length) {
  console.error(
    "ZIP must not ship icon sources / alternate rasters (keep repo lean on the box):\n" +
      leaked.map((e) => `  - ${e}`).join("\n"),
  );
  process.exit(1);
}

if (!list.includes("bin/dist-node/cli/abfall_api.cjs") || !list.includes("bin/dist-node/cli/fetch.cjs")) {
  console.error("ZIP missing embedded dist-node bundle under bin/dist-node/cli/");
  process.exit(1);
}

console.log(`OK: ${path.basename(zipPath)} (${list.length} entries) — LoxBerry layout is sane, no dev junk.`);
