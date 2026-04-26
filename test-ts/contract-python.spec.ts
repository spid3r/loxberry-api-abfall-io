import { expect } from "chai";
import { parseIcs } from "../src-ts/lib/abfall-service.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return fs.readFileSync(path.resolve(testDir, "fixtures", name), "utf-8");
}

describe("Runtime contract tests", () => {
  it("keeps stable parsed output for ICS fixture", () => {
    const parsed = parseIcs(fixture("sample.ics"));
    expect(parsed).to.deep.equal({
      Paper: {
        tage: parsed.Paper.tage,
        datum: "20.12.2099",
        wochentag: "Sunday",
        wochentag_num: 7,
      },
      "Residual Waste": {
        tage: parsed["Residual Waste"].tage,
        datum: "21.12.2099",
        wochentag: "Monday",
        wochentag_num: 1,
      },
    });
    expect(parsed.Paper.tage).to.be.greaterThan(0);
  });
});
