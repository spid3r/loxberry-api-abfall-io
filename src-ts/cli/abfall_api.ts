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

function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command) {
    process.stdout.write(`Usage: ${process.argv[1]} <command> [args]\n`);
    process.stdout.write("Commands: search_street <q>, search_hnr <street_id>, fetch, status, log\n");
    process.exit(1);
  }

  if (command === "search_street") {
    const query = args[0];
    if (!query) {
      printJson({ error: "Missing search query" });
      process.exit(1);
    }
    printJson(await searchStreet(query));
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
