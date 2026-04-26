/**
 * Puts a copy of dist-node under bin/dist-node/ so bin/abfall_api.cjs and
 * bin/fetch.cjs can `require("./dist-node/cli/…")` in dev — same relative layout
 * as the release ZIP and on LoxBerry.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "dist-node");
const dst = path.join(root, "bin", "dist-node");

if (!fs.existsSync(src)) {
  console.error("mirror-bin-dist: dist-node/ missing. Run the bundle step first.");
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("Mirrored dist-node/ -> bin/dist-node/ (launcher parity with release ZIP).");
