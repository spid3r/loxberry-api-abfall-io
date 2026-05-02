import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { expect } from "chai";
import { readMergedCronInstallProbe, resolvePaths } from "../src-ts/lib/paths.js";

describe("path resolution", () => {
  it("uses LBHOMEDIR plugin paths when available", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbpaths-"));
    const pluginName = "abfallio";
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

  it("uses LoxBerry paths when env set even if config/plugins/<name>/ does not exist yet", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbpaths-nodir-"));
    const pluginName = "abfallio";
    const pluginConfigDir = path.join(tempRoot, "config", "plugins", pluginName);

    const oldHome = process.env.LBHOMEDIR;
    const oldPlugin = process.env.LBPPLUGINDIR;
    process.env.LBHOMEDIR = tempRoot;
    process.env.LBPPLUGINDIR = pluginName;
    try {
      const paths = resolvePaths();
      expect(paths.configDir).to.equal(pluginConfigDir);
      expect(paths.configFile).to.equal(path.join(pluginConfigDir, "abfall.json"));
    } finally {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("merged cron probe detects REPLACELB placeholder", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbcron-"));
    const pluginName = "abfallio";
    const cronDir = path.join(tempRoot, "system", "cron", "cron.d");
    fs.mkdirSync(cronDir, { recursive: true });
    const cronFile = path.join(cronDir, pluginName);
    fs.writeFileSync(cronFile, "node REPLACELBPHOMEDIR/bin/plugins/x/fetch.cjs\n", "utf-8");

    const oldHome = process.env.LBHOMEDIR;
    const oldPlugin = process.env.LBPPLUGINDIR;
    process.env.LBHOMEDIR = tempRoot;
    process.env.LBPPLUGINDIR = pluginName;
    try {
      const p = readMergedCronInstallProbe();
      expect(p).to.not.equal(null);
      expect(p!.file_exists).to.equal(true);
      expect(p!.replacelb_placeholder_found).to.equal(true);
    } finally {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
    }
  });

  it("does not trust REPLACELB* placeholders in LBHOMEDIR / LBPPLUGINDIR from cron", () => {
    const oldHome = process.env.LBHOMEDIR;
    const oldPlugin = process.env.LBPPLUGINDIR;
    process.env.LBHOMEDIR = "REPLACELBPHOMEDIR";
    process.env.LBPPLUGINDIR = "REPLACELBPPLUGINDIR";
    try {
      const paths = resolvePaths();
      expect(paths.configFile).to.not.include("REPLACELB");
      expect(paths.configDir).to.not.include("REPLACELBPHOMEDIR");
      expect(paths.dataDir).to.not.include("REPLACELBPHOMEDIR");
    } finally {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
    }
  });

  it("merged cron probe reports no placeholder when cron is expanded", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lbcron2-"));
    const pluginName = "abfallio";
    const cronDir = path.join(tempRoot, "system", "cron", "cron.d");
    fs.mkdirSync(cronDir, { recursive: true });
    const cronFile = path.join(cronDir, pluginName);
    fs.writeFileSync(
      cronFile,
      `LBHOMEDIR=${tempRoot} /usr/bin/node ${tempRoot}/bin/plugins/${pluginName}/fetch.cjs\n`,
      "utf-8",
    );

    const oldHome = process.env.LBHOMEDIR;
    const oldPlugin = process.env.LBPPLUGINDIR;
    process.env.LBHOMEDIR = tempRoot;
    process.env.LBPPLUGINDIR = pluginName;
    try {
      const p = readMergedCronInstallProbe();
      expect(p!.replacelb_placeholder_found).to.equal(false);
    } finally {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
    }
  });
});
