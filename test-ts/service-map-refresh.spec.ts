import { expect } from "chai";
import {
  isAllowedServiceMapUrl,
  parseServiceMapFromAbfallIoPy,
  parseServiceMapText,
} from "../src-ts/lib/service-map-refresh.js";

describe("service map refresh (upstream AbfallIO.py)", () => {
  it("isAllowedServiceMapUrl accepts GitHub https URLs only", () => {
    expect(isAllowedServiceMapUrl("https://raw.githubusercontent.com/mampfes/x/main/y.py")).to.equal(
      true,
    );
    expect(isAllowedServiceMapUrl("http://raw.githubusercontent.com/x")).to.equal(false);
    expect(isAllowedServiceMapUrl("https://evil.com/foo.py")).to.equal(false);
  });

  it("parseServiceMapFromAbfallIoPy extracts entries from SERVICE_MAP snippet", () => {
    const src = `SERVICE_MAP = [
 { "title": "Test A", "url": "https://a.de/", "service_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
 { "title": "Test B", "url": "https://b.de/", "service_id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
]`;
    const r = parseServiceMapFromAbfallIoPy(src);
    expect(r.length).to.equal(2);
    expect(r[0].title).to.equal("Test A");
    expect(r[0].service_id).to.equal("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(r[1].service_id).to.equal("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("parseServiceMapText parses JSON array", () => {
    const j = [
      { title: "X", url: "https://x.de/", service_id: "cccccccccccccccccccccccccccccccc" },
    ];
    const r = parseServiceMapText(JSON.stringify(j));
    expect(r.length).to.equal(1);
    expect(r[0].title).to.equal("X");
  });
});
