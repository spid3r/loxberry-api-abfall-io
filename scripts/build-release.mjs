import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const pluginCfg = path.join(root, "plugin.cfg");

function readVersion() {
  const content = fs.readFileSync(pluginCfg, "utf-8");
  const line = content.split(/\r?\n/).find((l) => l.startsWith("VERSION="));
  return line ? line.split("=")[1].trim() : "0.0.0";
}

const requiredArtifacts = [
  "bin/abfall_api.cjs",
  "bin/fetch.cjs",
  "dist-node/cli/abfall_api.cjs",
  "dist-node/cli/fetch.cjs",
  "templates/lang/language_en.ini",
  "templates/lang/language_de.ini",
];

for (const artifact of requiredArtifacts) {
  const full = path.join(root, artifact);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing runtime artifact '${artifact}'. Run 'npm run build' first.`);
  }
}

const excludes = [
  /^\.git\//,
  /^\.husky\//,
  /^\.github\//,
  /^\.cursor\//,
  /^\.playwright-mcp\//,
  /^\.vscode\//,
  /^coverage\//,
  /^\.c8_output\//,
  /^\.nyc_output\//,
  /^\.gitignore$/,
  /^\.env$/,
  /^\.env\./, // e.g. .env.example, .env.local
  /^\.releaserc\.json$/,
  /^CHANGELOG\.md$/,
  /^__pycache__\//,
  /^bin\/__pycache__\//,
  /^dist\//,
  /^dist-node\//,
  /^node_modules\//,
  /^src-ts\//,
  /^test-ts\//,
  /^test-e2e\//,
  /^playwright-report\//,
  /^test-results\//,
  /^docs\//,
  /^scripts\//,
  /^tsconfig\.json$/,
  /^commitlint\.config\..+$/,
  /^playwright\.config\.ts$/,
  /^package-lock\.json$/,
  /^package\.json$/,
  /^complete\.csv$/,
  /^test\.csv$/,
  /^tmp-.*\.html$/,
  /^data\/(credentials\.json|abfall_data\.json|abfall\.log)$/,
  /\.pyc$/,
  /^\.agent-tools\//,
];

function shouldInclude(relPath) {
  const normalized = relPath.replaceAll("\\", "/");
  return !excludes.some((rx) => rx.test(normalized));
}

function collectFiles(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      collectFiles(full, base, acc);
    } else if (shouldInclude(rel)) {
      acc.push({ full, rel });
    }
  }
  return acc;
}

const version = readVersion();
const zipName = `loxberry-plugin-abfallio-${version}.zip`;
const zipPath = path.join(distDir, zipName);
fs.mkdirSync(distDir, { recursive: true });

const files = collectFiles(root);

const distNodeRoot = path.join(root, "dist-node");
if (fs.existsSync(distNodeRoot)) {
  for (const entry of collectFiles(distNodeRoot, distNodeRoot)) {
    files.push({ full: entry.full, rel: `bin/dist-node/${entry.rel}` });
  }
}

/** One entry per relpath (defensive: duplicate rels break some unzip stacks). */
const byRel = new Map();
for (const f of files) {
  byRel.set(f.rel, f);
}
const fileEntries = [...byRel.values()];

/**
 * LoxBerry uses PHP/ZipArchive + unzip; some builds expect explicit directory
 * records (see e.g. “Error while extracting from plugin archive” when only
 * file paths with slashes are present).
 */
function directoryPrefixesForZip(rels) {
  const dirs = new Set();
  for (const rel of rels) {
    const parts = rel.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      dirs.add(`${parts.slice(0, i + 1).join("/")}/`);
    }
  }
  return [...dirs].sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}

const dirEntries = directoryPrefixesForZip(fileEntries.map((f) => f.rel));

console.log(`Building ${zipName}...`);
for (const d of dirEntries) {
  console.log(`  + ${d} (dir)`);
}
for (const file of fileEntries) {
  console.log(`  + ${file.rel}`);
}

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  for (const name of dirEntries) {
    archive.append(null, { name });
  }
  for (const file of fileEntries) {
    archive.file(file.full, { name: file.rel });
  }
  archive.finalize();
});

const sizeKb = Math.round(fs.statSync(zipPath).size / 1024);
console.log(`\nCreated: ${zipPath}`);
console.log(`Size: ${sizeKb} KB`);
console.log("\nUpload this file in LoxBerry Admin > System > Plugins");
