import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("wiki automation", () => {
  const root = path.resolve(__dirname, "..");
  const generatedPath = path.join(root, "docs", "WIKI_DOKUWIKI_START.txt");

  it("generates wiki file from template and data", () => {
    execFileSync(process.execPath, ["./scripts/generate-wiki-doc.mjs"], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf-8",
    });

    const text = fs.readFileSync(generatedPath, "utf-8");
    expect(text).to.contain("====== Abfall IO / Abfallabholung (api.abfall.io) ======");
    expect(text).to.contain("===== Unterstützte Regionen (aus Service-Map) =====");
    expect(text).to.contain("Service-ID");
    expect(text).to.not.match(/\{\{[A-Z0-9_]+\}\}/);
  });

  it("validates generated wiki file", () => {
    const out = execFileSync(process.execPath, ["./scripts/validate-wiki-doc.mjs"], {
      cwd: root,
      stdio: "pipe",
      encoding: "utf-8",
    });
    expect(out).to.contain("Wiki validation OK");
  });
});
