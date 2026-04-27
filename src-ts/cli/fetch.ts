#!/usr/bin/env node
import { configuredServiceKey, fetchData, loadConfig, shouldFetch } from "../lib/abfall-service.js";
import { log } from "../lib/logger.js";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  log.info("==================================================");
  log.info(`Waste collection fetch started${force ? " (forced)" : ""}`);

  const config = loadConfig();
  if (!configuredServiceKey(config)) {
    log.warn("No service key (waste region) configured — open the plugin admin, Settings, choose your region, save, then set Location. Skipping fetch.");
    return;
  }
  if (!config.location?.f_id_strasse) {
    log.warn("No location configured, skipping fetch");
    return;
  }

  if (!shouldFetch(config, force)) {
    return;
  }

  const result = await fetchData(config);
  log.info(`Fetch successful: ${result.standort ?? "?"}`);
  const names = Object.keys(result.termine);
  if (names.length > 0) {
    log.info("Upcoming dates:");
    for (const name of names) {
      const info = result.termine[name];
      log.info(`  ${name.padEnd(25, " ")} ${info.datum} (${info.wochentag}, in ${info.tage} days)`);
    }
  } else {
    log.warn("No upcoming dates found");
  }
  log.info("Fetch completed successfully");
}

main().catch((err) => {
  log.error(`Fetch failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
