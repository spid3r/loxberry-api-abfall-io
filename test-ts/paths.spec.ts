import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { expect } from "chai";
import { resolvePaths } from "../src-ts/lib/paths.js";

describe("path resolution", () => {
  it("uses LBHOMEDIR plugin paths when available", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbpaths-"));
    const pluginName = "wasteapiio";
    const pluginConfigDir = path.join(tempRoot, "config", "plugins", pluginName);
    fs.mkdirSync(pluginConfigDir, { recursive: true });

    const oldHome = process.env.LBHOMEDIR;
    const oldPlugin = process.env.LBPPLUGINDIR;
    process.env.LBHOMEDIR = tempRoot;
    process.env.LBPPLUGINDIR = pluginName;
    try {
      const paths = resolvePaths();
      expect(paths.configDir).to.equal(pluginConfigDir);
      expect(paths.dataDir).to.equal(path.join(tempRoot, "data", "plugins", pluginName));
      expect(paths.logDir).to.equal(path.join(tempRoot, "log", "plugins", pluginName));
    } finally {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
    }
  });
});
