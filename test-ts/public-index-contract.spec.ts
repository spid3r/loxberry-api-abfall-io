import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "mocha";

/**
 * Source contract: public webfrontend/html/index.php empty-cache JSON
 * (keep message keys in sync when changing PHP).
 */
describe("public index.php empty JSON (source check)", () => {
  it("index.php must emit code no_data and human error string in PHP source", () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const p = path.join(
      __dirname,
      "..",
      "webfrontend",
      "html",
      "index.php",
    );
    const src = readFileSync(p, "utf-8");
    assert.match(src, /'code'\s*=>\s*'no_data'/);
    assert.match(src, /'error'\s*=>\s*'No data available'/);
  });
});
