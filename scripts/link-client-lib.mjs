/**
 * Binds the sibling loxberry-client-library via `npm link` and verifies the CLI is reachable.
 * Run from repo root: node ./scripts/link-client-lib.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const libRoot = path.resolve(root, "..", "loxberry-client-library");
const cli = path.join(root, "node_modules", "loxberry-client-library", "dist", "cli.cjs");

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(path.join(libRoot, "package.json"))) {
  console.error("Expected loxberry-client-library at:\n  " + libRoot);
  process.exit(1);
}

console.log("> (1/4) npm run build  [" + libRoot + "]\n");
run(libRoot, "npm", ["run", "build"]);

console.log("\n> (2/4) npm link  (register global link to library)\n");
run(libRoot, "npm", ["link"]);

console.log("\n> (3/4) npm link loxberry-client-library  (in plugin repo)\n");
run(root, "npm", ["link", "loxberry-client-library"]);

if (!fs.existsSync(cli)) {
  console.error("Link did not create expected CLI at:\n  " + cli);
  process.exit(1);
}
console.log("\n> (4/4) OK — CLI present:\n  " + cli + "\n");
