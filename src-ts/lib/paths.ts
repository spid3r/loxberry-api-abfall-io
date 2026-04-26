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

export function resolvePaths(): ResolvedPaths {
  let lbhomedir = process.env.LBHOMEDIR ?? "";
  let lbpplugindir = process.env.LBPPLUGINDIR ?? "";

  if (!lbhomedir && fs.existsSync("/opt/loxberry")) {
    lbhomedir = "/opt/loxberry";
  }

  if (!lbpplugindir && lbhomedir) {
    lbpplugindir = inferLoxBerryPluginDir(lbhomedir);
  }

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

  return {
    configDir,
    dataDir,
    logDir,
    configFile: path.join(configDir, "abfall.json"),
    cacheFile: path.join(dataDir, "abfall_data.json"),
    logFile: path.join(logDir, "abfall.log"),
  };
}
