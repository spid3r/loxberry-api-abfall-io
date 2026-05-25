import { expect } from "chai";
import {
  analyzeMergedCronContent,
  buildPluginCronLine,
  mergedCronNeedsPatch,
} from "../src-ts/lib/cron-install.js";

describe("cron install analysis", () => {
  const legacyLine =
    "17 * * * * loxberry LBHOMEDIR=/opt/loxberry LBPPLUGINDIR=abfallio " +
    "/usr/bin/node /opt/loxberry/bin/plugins/abfallio/fetch.cjs >> /opt/loxberry/log/plugins/abfallio/abfall.log 2>&1";

  const wrapperLine = buildPluginCronLine({
    lbhomedir: "/opt/loxberry",
    pluginFolder: "abfallio",
    logDir: "/opt/loxberry/log/plugins/abfallio",
  });

  it("flags legacy hard-coded /usr/bin/node fetch.cjs as broken", () => {
    const a = analyzeMergedCronContent(legacyLine);
    expect(a.hardcoded_node_invocation).to.equal(true);
    expect(a.uses_fetch_wrapper).to.equal(false);
    expect(a.node_path_likely_broken).to.equal(true);
    expect(a.replacelb_placeholder_found).to.equal(false);
  });

  it("accepts wrapper-based cron as healthy", () => {
    const a = analyzeMergedCronContent(wrapperLine);
    expect(a.uses_fetch_wrapper).to.equal(true);
    expect(a.hardcoded_node_invocation).to.equal(false);
    expect(a.node_path_likely_broken).to.equal(false);
  });

  it("detects unreplaced REPLACELB placeholders", () => {
    const raw = buildPluginCronLine({
      lbhomedir: "/opt/loxberry",
      pluginFolder: "abfallio",
      logDir: "/opt/loxberry/log/plugins/abfallio",
      usePlaceholders: true,
    });
    const a = analyzeMergedCronContent(raw);
    expect(a.replacelb_placeholder_found).to.equal(true);
    expect(mergedCronNeedsPatch(raw)).to.equal(true);
  });

  it("does not require patch when wrapper cron is already canonical", () => {
    expect(mergedCronNeedsPatch(wrapperLine)).to.equal(false);
  });

  it("requires patch for legacy direct node invocation", () => {
    expect(mergedCronNeedsPatch(legacyLine)).to.equal(true);
  });

  it("builds placeholder cron line for plugin package", () => {
    const line = buildPluginCronLine({
      lbhomedir: "/opt/loxberry",
      pluginFolder: "abfallio",
      logDir: "/opt/loxberry/log/plugins/abfallio",
      usePlaceholders: true,
    });
    expect(line).to.include("REPLACELBPHOMEDIR/bin/plugins/REPLACELBPPLUGINDIR/run_fetch.sh");
    expect(line).to.not.include("/usr/bin/node");
    expect(line).to.not.include("fetch.cjs");
  });
});
