#!/usr/bin/env node
import {
  clearLog,
  fetchData,
  getLog,
  getStatus,
  loadConfig,
  saveConfig,
  searchHnr,
  searchStreet,
} from "../lib/abfall-service.js";
import { refreshServiceMapToUserFile } from "../lib/service-map-refresh.js";
import { decodeShellQueryArg } from "../lib/shell-query-arg.js";
import { searchServiceRegions } from "../lib/service-map.js";

function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command) {
    process.stdout.write(`Usage: ${process.argv[1]} <command> [args]\n`);
    process.stdout.write(
      "Commands: search_street <q>, search_hnr <street_id>, search_service <q>, refresh_service_map [url], fetch, status, log\n",
    );
    process.exit(1);
  }

  if (command === "search_street") {
    const raw = args[0] ?? "";
    const query = decodeShellQueryArg(raw);
    if (!query) {
      printJson({ error: "Missing search query" });
      process.exit(1);
    }
    printJson(await searchStreet(query));
    return;
  }

  if (command === "search_service") {
    const query = decodeShellQueryArg(args[0] ?? "");
    printJson(searchServiceRegions(query));
    return;
  }

  if (command === "refresh_service_map") {
    const url = args[0] ?? "";
    const result = await refreshServiceMapToUserFile(loadConfig(), url || undefined);
    printJson(result);
    if (!result.success) {
      process.exit(1);
    }
    return;
  }

  if (command === "search_hnr") {
    const streetId = args[0];
    if (!streetId) {
      printJson({ error: "Missing street_id" });
      process.exit(1);
    }
    printJson(await searchHnr(streetId));
    return;
  }

  if (command === "register") {
    printJson({
      success: true,
      client: "(not needed - using api.abfall.io)",
      expires: "n/a",
    });
    return;
  }

  if (command === "fetch") {
    printJson(await fetchData());
    return;
  }

  if (command === "status") {
    printJson(getStatus());
    return;
  }

  if (command === "log") {
    const lines = args[0] ? Number.parseInt(args[0], 10) : 100;
    process.stdout.write(getLog(Number.isFinite(lines) ? lines : 100));
    return;
  }

  if (command === "clear_log") {
    clearLog();
    printJson({ success: true });
    return;
  }

  if (command === "save_config") {
    const cfgJson = args[0] ?? "";
    const cfg = cfgJson ? JSON.parse(cfgJson) : JSON.parse(await readStdin());
    const existing = loadConfig();
    saveConfig({ ...existing, ...cfg });
    printJson({ success: true });
    return;
  }

  printJson({ error: `Unknown command: ${command}` });
  process.exit(1);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

main().catch((err) => {
  printJson({ error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
