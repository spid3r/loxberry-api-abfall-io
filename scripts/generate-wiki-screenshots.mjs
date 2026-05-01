import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const outDir = path.join(root, "docs", "wiki-assets");
const baseUrl = (process.env.LOXBERRY_BASE_URL ?? "").trim();
const pluginFolder = (process.env.PLUGIN_FOLDER ?? "abfallio").trim();
const username = (process.env.LOXBERRY_USERNAME ?? "").trim();
const password = (process.env.LOXBERRY_PASSWORD ?? "").trim();
const headed =
  process.argv.includes("--headed") ||
  process.env.WIKI_SCREENSHOTS_HEADED === "1" ||
  process.env.WIKI_SCREENSHOTS_HEADED === "true";
const keepOpen =
  process.argv.includes("--watch") ||
  process.env.WIKI_SCREENSHOTS_WATCH === "1" ||
  process.env.WIKI_SCREENSHOTS_WATCH === "true";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0 && res.status < 500) return;
    } catch {
      // retry
    }
    await sleep(350);
  }
  throw new Error(`Target did not become ready within ${timeoutMs}ms (${url})`);
}

async function sanitizeUi(page) {
  await page.evaluate(() => {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el && "value" in el) el.value = value;
    };

    setText("status-location", "Beispielstadt, Musterstraße 12");
    setText("status-fetch", "2026-05-01 08:00:00");
    setText("status-next", "in 5h");

    setValue("service-key", "");
    setValue("service-key-expert", "");
    setValue("service-region-search", "Beispielregion");
    setValue("street-search", "");
    setText("selected-street", "Beispielstraße");
    setText("selected-hnr", "12");

    setValue("mqtt-user", "<optional>");
    setValue("mqtt-password", "********");
    setValue("mqtt-host", "localhost");

    document.querySelectorAll(".selected-location").forEach((el) => {
      const strong = el.querySelector("strong");
      const label = strong ? `${strong.textContent ?? ""} ` : "";
      el.textContent = `${label}Beispielstraße 12`;
    });
  });
}

async function activateTab(page, tabId) {
  await page.evaluate((selectedId) => {
    const selected = document.querySelector(selectedId);
    if (!selected) return;
    document.querySelectorAll(".tab-content").forEach((el) => el.classList.remove("active"));
    selected.classList.add("active");
    document.querySelectorAll("a.abfallio-tab").forEach((el) => el.classList.remove("active"));
    const navMap = {
      "#tab-status": "a.abfallio-tab[href*='tab=status']",
      "#tab-location": "a.abfallio-tab[href*='tab=location']",
      "#tab-settings": "a.abfallio-tab[href*='tab=settings']",
      "#tab-log": "a.abfallio-tab[href*='tab=log']",
    };
    const nav = document.querySelector(navMap[selectedId] ?? "");
    if (nav) nav.classList.add("active");
  }, tabId);
}

async function captureTab(page, route, tabId, targetFile) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(450);
  await sanitizeUi(page);
  await activateTab(page, tabId);
  await page.waitForTimeout(120);
  await page.screenshot({ path: targetFile, type: "jpeg", quality: 70, fullPage: true });
}

async function run() {
  if (!baseUrl) {
    throw new Error("LOXBERRY_BASE_URL missing. Run with .env configured (npm run wiki:screenshots).");
  }
  if (!username || !password) {
    throw new Error("LOXBERRY_USERNAME / LOXBERRY_PASSWORD missing in environment.");
  }

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 120 : 0 });
  const context = await browser.newContext({
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1600, height: 1300 },
    colorScheme: "light",
    httpCredentials: { username, password },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    const route = `${baseUrl}/admin/plugins/${pluginFolder}/index.php?lang=de&tab=status`;
    await waitForServer(route, 45_000);
    await captureTab(page, route, "#tab-status", path.join(outDir, "abfallio-status-de.jpg"));
    await captureTab(page, route, "#tab-location", path.join(outDir, "abfallio-location-de.jpg"));
    await captureTab(page, route, "#tab-settings", path.join(outDir, "abfallio-settings-de.jpg"));
    if (keepOpen) {
      console.log("Watch mode active: browser remains open. Close the browser window to finish.");
      await page.waitForEvent("close");
    }
    console.log(`Screenshots generated in ${path.relative(root, outDir)} from ${baseUrl}`);
  } finally {
    if (browser.isConnected()) await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
