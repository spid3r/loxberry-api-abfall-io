import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

export interface ResolvedPaths {
  configDir: string;
  dataDir: string;
  logDir: string;
  configFile: string;
  cacheFile: string;
  logFile: string;
  /**
   * Shipped `data/abfallio-service-map.json` in the plugin package (read-only on appliance).
   * Prefer `dataDir/abfallio-service-map.json` when present (user refresh).
   */
  serviceMapBundledFile: string;
}

function findRepoRoot(start: string): string {
  let current = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(current, "plugin.cfg"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start, "../../..");
}

function inferLoxBerryPluginDir(lbhomedir: string): string {
  if (!lbhomedir) return "";
  const here = path.resolve(thisDir);
  const prefix = path.join(lbhomedir, "bin", "plugins") + path.sep;
  if (here.startsWith(prefix)) {
    return here.slice(prefix.length).split(path.sep)[0] ?? "";
  }
  return "";
}

/** Resolved LBHOMEDIR + plugin folder; same rules as {@link resolvePaths}. */
export function getLoxBerryHomeAndPlugin(): { lbhomedir: string; lbpplugindir: string } {
  let lbhomedir = process.env.LBHOMEDIR ?? "";
  let lbpplugindir = process.env.LBPPLUGINDIR ?? "";

  if (!lbhomedir && fs.existsSync("/opt/loxberry")) {
    lbhomedir = "/opt/loxberry";
  }

  if (!lbpplugindir && lbhomedir) {
    lbpplugindir = inferLoxBerryPluginDir(lbhomedir);
  }
  return { lbhomedir, lbpplugindir };
}

/**
 * If running inside a LoxBerry plugin (known home + plugin id), read the
 * system-merged cron file and report whether LoxBerry left `REPLACELB*` in it.
 * Used by `getStatus()` and by E2E on the live appliance.
 */
export function readMergedCronInstallProbe():
  | {
      merged_cron_path: string;
      file_exists: boolean;
      replacelb_placeholder_found: boolean;
    }
  | null {
  const { lbhomedir, lbpplugindir } = getLoxBerryHomeAndPlugin();
  if (!lbhomedir || !lbpplugindir) {
    return null;
  }
  /** LoxBerry copies `cron/crontab` to `system/cron/cron.d/<$pname>` (plugin folder), not `loxberry-plugin-*`. */
  const merged = path.join(
    lbhomedir,
    "system",
    "cron",
    "cron.d",
    lbpplugindir,
  );
  if (!fs.existsSync(merged)) {
    return { merged_cron_path: merged, file_exists: false, replacelb_placeholder_found: false };
  }
  const text = fs.readFileSync(merged, "utf-8");
  return {
    merged_cron_path: merged,
    file_exists: true,
    replacelb_placeholder_found: text.includes("REPLACELB"),
  };
}

export function resolvePaths(): ResolvedPaths {
  const { lbhomedir, lbpplugindir } = getLoxBerryHomeAndPlugin();

  let configDir: string;
  let dataDir: string;
  let logDir: string;

  const lbPluginConfig = lbpplugindir
    ? path.join(lbhomedir, "config", "plugins", lbpplugindir)
    : "";
  if (lbpplugindir && fs.existsSync(lbPluginConfig)) {
    configDir = lbPluginConfig;
    dataDir = path.join(lbhomedir, "data", "plugins", lbpplugindir);
    logDir = path.join(lbhomedir, "log", "plugins", lbpplugindir);
  } else {
    const base = findRepoRoot(thisDir);
    configDir = path.join(base, "config");
    dataDir = path.join(base, "data");
    logDir = path.join(base, "data");
  }

  const pluginRoot = findRepoRoot(thisDir);
  return {
    configDir,
    dataDir,
    logDir,
    configFile: path.join(configDir, "abfall.json"),
    cacheFile: path.join(dataDir, "abfall_data.json"),
    logFile: path.join(logDir, "abfall.log"),
    serviceMapBundledFile: path.join(pluginRoot, "data", "abfallio-service-map.json"),
  };
}
