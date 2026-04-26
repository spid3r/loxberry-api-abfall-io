import { expect } from "chai";
import { pickFilteredTermine } from "../src-ts/lib/abfall-service.js";
import type { WasteEntry } from "../src-ts/lib/types.js";

describe("pickFilteredTermine", () => {
  const t: Record<string, WasteEntry> = {
    Restabfall: { tage: 1, datum: "01.01.2026", wochentag: "Do", wochentag_num: 4 },
    "Bio Tonne": { tage: 2, datum: "02.01.2026", wochentag: "Fr", wochentag_num: 5 },
  };

  it("returns all when filter is empty or missing", () => {
    expect(Object.keys(pickFilteredTermine(t, []))).to.have.length(2);
    expect(Object.keys(pickFilteredTermine(t, undefined))).to.have.length(2);
  });

  it("keeps only matching names (umlaut-folded)", () => {
    const one = pickFilteredTermine(t, ["Restabfall"]);
    expect(Object.keys(one)).to.deep.equal(["Restabfall"]);
  });

  it("matches with folded filter for umlaut names", () => {
    const u: Record<string, WasteEntry> = {
      "Grüner Punkt": { tage: 0, datum: "01.01.2026", wochentag: "Do", wochentag_num: 4 },
    };
    const out = pickFilteredTermine(u, ["Gruner Punkt"]);
    expect(Object.keys(out)).to.deep.equal(["Grüner Punkt"]);
  });
});
