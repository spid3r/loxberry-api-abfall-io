import { expect } from "chai";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const specDir = path.dirname(fileURLToPath(import.meta.url));

function runCliJson(args: string[]): unknown {
  const root = path.resolve(specDir, "..", "..");
  const cli = path.join(root, "dist-node", "cli", "abfall_api.cjs");
  const out = execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  return JSON.parse(out);
}

describe("live street/fetch smoke", function () {
  this.timeout(90_000);

  const streetQuery = process.env.TEST_STREET_QUERY?.trim();
  const preferredStreetName = process.env.TEST_STREET_NAME?.trim().toLowerCase();

  before(function () {
    if (!streetQuery) this.skip();
  });

  it("searches street, saves location, and fetches waste data", function () {
    const testKey = (process.env.TEST_SERVICE_KEY ?? "6efba91e69a5b454ac0ae3497978fe1d").trim().toLowerCase();
    const keySave = runCliJson(["save_config", JSON.stringify({ service_key: testKey })]) as { success?: boolean };
    expect(keySave.success).to.equal(true);

    const streets = runCliJson(["search_street", streetQuery ?? ""]) as Array<{ id: string; name: string }>;
    expect(streets.length).to.be.greaterThan(0);

    const selectedStreet =
      streets.find((s) => preferredStreetName && s.name.toLowerCase().includes(preferredStreetName)) ?? streets[0];
    expect(selectedStreet?.id).to.be.a("string").and.not.empty;

    const hnrCandidates = runCliJson(["search_hnr", selectedStreet.id]) as Array<{ id: string; name: string }>;
    const selectedHnr = hnrCandidates[0] ?? { id: "__not_needed__", name: "" };

    const kommune = /^(\d+)/.exec(selectedStreet.id)?.[1] ?? "";
    expect(kommune).to.not.equal("");

    const cfg = {
      service_key: testKey,
      location: {
        f_id_kommune: kommune,
        f_id_strasse: selectedStreet.id,
        street_name: selectedStreet.name,
        f_id_strasse_hnr: selectedHnr.id,
        hnr_name: selectedHnr.name,
      },
    };
    const saveRes = runCliJson(["save_config", JSON.stringify(cfg)]) as { success?: boolean };
    expect(saveRes.success).to.equal(true);

    const fetchRes = runCliJson(["fetch"]) as { termine?: Record<string, unknown>; error?: string };
    expect(fetchRes.error, fetchRes.error ?? "unexpected fetch error").to.equal(undefined);
    expect(Object.keys(fetchRes.termine ?? {}).length).to.be.greaterThan(0);
  });
});
