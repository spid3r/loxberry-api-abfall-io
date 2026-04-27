import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { shouldFetch } from "../src-ts/lib/abfall-service.js";
import type { PluginConfig, WasteData } from "../src-ts/lib/types.js";

function setupFakeLoxberry(): { tempRoot: string; restore: () => void; cacheFile: string } {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "abfallio-fuzz-"));
  const pluginName = "abfallio";
  const dataDir = path.join(tempRoot, "data", "plugins", pluginName);
  const cfgDir = path.join(tempRoot, "config", "plugins", pluginName);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(cfgDir, { recursive: true });

  const oldHome = process.env.LBHOMEDIR;
  const oldPlugin = process.env.LBPPLUGINDIR;
  process.env.LBHOMEDIR = tempRoot;
  process.env.LBPPLUGINDIR = pluginName;

  return {
    tempRoot,
    cacheFile: path.join(dataDir, "abfall_data.json"),
    restore: () => {
      if (oldHome === undefined) delete process.env.LBHOMEDIR;
      else process.env.LBHOMEDIR = oldHome;
      if (oldPlugin === undefined) delete process.env.LBPPLUGINDIR;
      else process.env.LBPPLUGINDIR = oldPlugin;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

function writeCache(cacheFile: string, partial: Partial<WasteData>): void {
  const data: WasteData = {
    timestamp: partial.timestamp ?? "2026-04-26 06:00:00",
    standort: partial.standort ?? "Main Street",
    location: partial.location ?? "Main Street",
    termine: partial.termine ?? {},
    ...partial,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(data));
}

/** shouldFetch() only runs when a service key and street id are set (no default region). */
function withSchedulerPrereq(cfg: PluginConfig): PluginConfig {
  return {
    service_key: "test-fuzz-service-key",
    location: { f_id_strasse: "1" },
    ...cfg,
  };
}

describe("fetch scheduling with fuzz factor", () => {
  it("forces a fetch regardless of cache when force=true", () => {
    const env = setupFakeLoxberry();
    try {
      writeCache(env.cacheFile, { timestamp: "2099-01-01 00:00:00" });
      const cfg = withSchedulerPrereq({ fetch_interval_hours: 24, fetch_fuzz_minutes: 30 });
      expect(shouldFetch(cfg, true)).to.equal(true);
    } finally {
      env.restore();
    }
  });

  it("fetches when no cache file exists", () => {
    const env = setupFakeLoxberry();
    try {
      const cfg = withSchedulerPrereq({ fetch_interval_hours: 24, fetch_fuzz_minutes: 30 });
      expect(shouldFetch(cfg, false)).to.equal(true);
    } finally {
      env.restore();
    }
  });

  it("respects the next-due time including the stored fuzz offset", () => {
    const env = setupFakeLoxberry();
    try {
      writeCache(env.cacheFile, {
        timestamp: "2026-04-26 06:00:00",
        next_fetch_offset_minutes: 25,
      });
      const cfg = withSchedulerPrereq({ fetch_interval_hours: 24, fetch_fuzz_minutes: 30 });
      // 24h after the fetch but BEFORE the +25 min fuzz offset => still skip.
      const tooEarly = new Date("2026-04-27T06:10:00");
      expect(shouldFetch(cfg, false, tooEarly)).to.equal(false);
      // After the fuzz offset window has elapsed => fetch.
      const justRight = new Date("2026-04-27T06:30:00");
      expect(shouldFetch(cfg, false, justRight)).to.equal(true);
    } finally {
      env.restore();
    }
  });

  it("supports negative fuzz offsets so fetches can fire earlier than the strict interval", () => {
    const env = setupFakeLoxberry();
    try {
      writeCache(env.cacheFile, {
        timestamp: "2026-04-26 06:00:00",
        next_fetch_offset_minutes: -20,
      });
      const cfg = withSchedulerPrereq({ fetch_interval_hours: 24, fetch_fuzz_minutes: 30 });
      // 23h 50min after last fetch: still before negative offset => skip.
      const stillEarly = new Date("2026-04-27T05:30:00");
      expect(shouldFetch(cfg, false, stillEarly)).to.equal(false);
      // 23h 45min, -20 fuzz => due at 23h 40min => fetch.
      const eligible = new Date("2026-04-27T05:45:00");
      expect(shouldFetch(cfg, false, eligible)).to.equal(true);
    } finally {
      env.restore();
    }
  });

  it("treats missing fuzz config as a default (30 minutes)", () => {
    const env = setupFakeLoxberry();
    try {
      writeCache(env.cacheFile, {
        timestamp: "2026-04-26 06:00:00",
        next_fetch_offset_minutes: 0,
      });
      const cfg = withSchedulerPrereq({ fetch_interval_hours: 24 });
      const exactInterval = new Date("2026-04-27T06:00:00");
      expect(shouldFetch(cfg, false, exactInterval)).to.equal(true);
    } finally {
      env.restore();
    }
  });
});
