/**
 * Writes LoxBerry autoupdate INI snippets for semantic-release prepare.
 *
 * Stable releases (e.g. 1.5.0) update only release.cfg.
 * Prereleases (e.g. 1.5.0-beta.1) update only prerelease.cfg so main/stable URLs
 * are untouched and beta testers can follow PRERELEASECFG (typically raw `beta`).
 */
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

/** true for 1.2.3-beta.4, 2.0.0-rc.1, etc. (SemVer prerelease segment). */
function isSemverPrerelease(v) {
  return /^\d+\.\d+\.\d+-/.test(v);
}

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
const pre = isSemverPrerelease(nextVersion);

if (pre) {
  fs.writeFileSync(prereleaseCfgPath, cfg, "utf-8");
  console.log(`Updated prerelease.cfg for ${nextVersion} (stable release.cfg unchanged).`);
} else {
  fs.writeFileSync(releaseCfgPath, cfg, "utf-8");
  console.log(`Updated release.cfg for ${nextVersion} (beta prerelease.cfg unchanged).`);
}
