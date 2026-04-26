import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";
import {
  extractHiddenFields,
  extractStreetOptions,
  inferKommuneFromStreetId,
  parseIcs,
} from "../src-ts/lib/abfall-service.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return fs.readFileSync(path.resolve(testDir, "fixtures", name), "utf-8");
}

describe("TypeScript parser behavior", () => {
  it("extracts hidden fields from init html", () => {
    const html = fixture("init.html");
    const fields = extractHiddenFields(html);
    expect(fields).to.deep.equal({
      foo: "bar",
      csrf: "abc123",
    });
  });

  it("extracts street options and skips placeholder", () => {
    const html = fixture("init.html");
    const streets = extractStreetOptions(html);
    expect(streets).to.deep.equal([
      { id: "5916main-street", name: "Main Street" },
      { id: "5916oak-lane", name: "Oak Lane" },
    ]);
  });

  it("infers municipality id from street id prefix", () => {
    expect(inferKommuneFromStreetId("5916main-street")).to.equal("5916");
    expect(inferKommuneFromStreetId("main-street")).to.equal("");
  });

  it("parses ICS and keeps nearest date per category", () => {
    const ics = fixture("sample.ics");
    const parsed = parseIcs(ics);
    expect(Object.keys(parsed)).to.have.members(["Paper", "Residual Waste"]);
    expect(parsed.Paper.datum).to.equal("20.12.2099");
    expect(parsed.Paper.wochentag).to.be.a("string");
    expect(parsed.Paper.wochentag_num).to.equal(7);
    expect(parsed.Paper.tage).to.be.greaterThan(0);
  });

  it("localizes weekday names to German when language is de, otherwise en", () => {
    const ics = fixture("sample.ics");
    const de = parseIcs(ics, { language: "de" });
    const en = parseIcs(ics, { language: "en" });
    expect(de.Paper.wochentag).to.equal("Sonntag");
    expect(en.Paper.wochentag).to.equal("Sunday");
  });
});
