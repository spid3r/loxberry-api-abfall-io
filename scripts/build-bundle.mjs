import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const entries = [
  { in: "src-ts/cli/abfall_api.ts", out: "dist-node/cli/abfall_api.cjs" },
  { in: "src-ts/cli/fetch.ts", out: "dist-node/cli/fetch.cjs" },
];

for (const entry of entries) {
  await build({
    entryPoints: [path.join(root, entry.in)],
    outfile: path.join(root, entry.out),
    bundle: true,
    platform: "node",
    // CJS so dependencies like `mqtt` (require-based) work when bundled. ESM would yield
    // "Dynamic require of \"stream\" is not supported" on the appliance.
    format: "cjs",
    target: "node20.10",
    // Single-file CJS: __filename is the bundle; drive import.meta.url from it (TypeScript "import.meta" in sources).
    banner: {
      js: "var _waiImportMetaUrl = require('url').pathToFileURL(__filename).href;",
    },
    define: {
      "import.meta.url": "_waiImportMetaUrl",
    },
    sourcemap: false,
    minify: false,
    legalComments: "none",
    logLevel: "info",
  });
  console.log(`Bundled ${entry.in} -> ${entry.out}`);
}
