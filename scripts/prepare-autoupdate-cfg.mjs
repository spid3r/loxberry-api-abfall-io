import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const nextVersion = process.argv[2];

if (!nextVersion) {
  throw new Error("Missing next release version argument.");
}

const releaseCfgPath = path.join(root, "release.cfg");
const prereleaseCfgPath = path.join(root, "prerelease.cfg");

const tag = `v${nextVersion}`;
const archiveUrl = `https://github.com/spid3r/loxberry-api-abfall-io/releases/download/${tag}/loxberry-plugin-abfallio-${nextVersion}.zip`;
const infoUrl = `https://github.com/spid3r/loxberry-api-abfall-io/releases/tag/${tag}`;

function renderConfig() {
  return [
    "[AUTOUPDATE]",
    `VERSION=${nextVersion}`,
    `ARCHIVEURL=${archiveUrl}`,
    `INFOURL=${infoUrl}`,
    "",
  ].join("\n");
}

const cfg = renderConfig();
fs.writeFileSync(releaseCfgPath, cfg, "utf-8");
fs.writeFileSync(prereleaseCfgPath, cfg, "utf-8");

console.log(`Updated release.cfg and prerelease.cfg for ${nextVersion}`);
