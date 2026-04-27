import { expect } from "chai";
import {
  mergeServiceMapEntries,
  searchServiceRegions,
  titleForServiceKey,
} from "../src-ts/lib/service-map.js";

const sample = [
  { title: "Ludwigshafen am Rhein", url: "https://www.ludwigshafen.de/", service_id: "6efba91e69a5b454ac0ae3497978fe1d" },
  { title: "Stadt Landshut", url: "https://www.landshut.de/", service_id: "bd0c2d0177a0849a905cded5cb734a6f" },
];

describe("service map (abfall.io region list)", () => {
  it("searchServiceRegions returns [] for queries shorter than 2 characters", () => {
    expect(searchServiceRegions("", 30, sample)).to.deep.equal([]);
    expect(searchServiceRegions("x", 30, sample)).to.deep.equal([]);
  });

  it("searchServiceRegions matches title (case-insensitive partial)", () => {
    const r = searchServiceRegions("landshut", 30, sample);
    expect(r.length).to.equal(1);
    expect(r[0].id).to.equal("bd0c2d0177a0849a905cded5cb734a6f");
    expect(r[0].name).to.equal("Stadt Landshut");
  });

  it("searchServiceRegions matches umlaut names when query is ASCII (e.g. Würzburg)", () => {
    const wue = {
      title: "Team Orange (Landkreis Würzburg)",
      url: "https://example.org/wue/",
      service_id: "abc123deadbeef0123456789abcdef0",
    };
    for (const q of ["würzburg", "wurzburg", "wurzbur", "landkreis wurz", "team orange"]) {
      const r = searchServiceRegions(q, 30, [wue]);
      expect(r.length, `query ${q}`).to.equal(1);
      expect(r[0]!.id).to.equal(wue.service_id);
    }
  });

  it("searchServiceRegions matches url host fragment", () => {
    const r = searchServiceRegions("ludwigshafen.de", 30, sample);
    expect(r.length).to.equal(1);
  });

  it("titleForServiceKey resolves known id", () => {
    expect(titleForServiceKey("6efba91e69a5b454ac0ae3497978fe1d", sample)).to.equal("Ludwigshafen am Rhein");
    expect(titleForServiceKey("bad", sample)).to.equal(null);
  });

  it("mergeServiceMapEntries keeps bundled rows missing from user map (no shadow deletion)", () => {
    const wue = {
      title: "Team Orange (Landkreis Würzburg)",
      url: "https://example.org/",
      service_id: "3701fd1ff111f63996ab46a448669ea3",
    };
    const other = {
      title: "Other (only in user file)",
      url: "https://u.example/",
      service_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    const merged = mergeServiceMapEntries([wue], [other]);
    expect(merged).to.have.length(2);
    expect(titleForServiceKey("3701fd1ff111f63996ab46a448669ea3", merged)).to.equal(wue.title);
    expect(
      searchServiceRegions("Würzburg", 10, merged).map((r) => r.id),
    ).to.include("3701fd1ff111f63996ab46a448669ea3");
  });
});
