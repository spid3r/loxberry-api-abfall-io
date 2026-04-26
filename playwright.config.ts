/**
 * Playwright config for the destructive end-to-end suite (test-e2e/).
 *
 * Runs ONLY when E2E_LIVE=1 is set. Each test file additionally guards itself
 * via test.skip(...) when the flag or required environment variables are
 * missing, so an accidental `npx playwright test` invocation cannot wipe out
 * a real LoxBerry plugin.
 *
 * Configuration is read from `.env`. Use:
 *
 *   npm run test:e2e:full
 *
 * which loads .env via dotenv-cli, sets E2E_LIVE=1, and forwards to Playwright.
 */

import { defineConfig } from "@playwright/test";

const baseURL =
  process.env.LOXBERRY_BASE_URL && process.env.LOXBERRY_BASE_URL.trim() !== ""
    ? process.env.LOXBERRY_BASE_URL.trim()
    : "http://loxberry.local";

/**
 * Visible browser by default on your PC (not CI). Set `E2E_HEADED=0` in `.env`
 * for headless. `npx playwright test --headed` also forces headed via Playwright.
 */
const isCi = process.env.CI === "true" || !!process.env.GITHUB_ACTIONS;
const runHeaded =
  !isCi &&
  process.env.E2E_HEADED !== "0" &&
  process.env.E2E_HEADED !== "false";

export default defineConfig({
  testDir: "./test-e2e",
  testMatch: /.*\.spec\.ts$/,
  // Match test-e2e suite (build, uninstall/install, long UI) — hooks count toward the same run budget.
  timeout: 15 * 60 * 1000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    /* Without this, only slowMo applied — Chromium still ran headless. */
    headless: isCi || !runHeaded,
    httpCredentials: {
      username: process.env.LOXBERRY_USERNAME ?? "",
      password: process.env.LOXBERRY_PASSWORD ?? "",
    },
    ignoreHTTPSErrors: true,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          ...(process.env.PW_CHROME_CHANNEL
            ? { channel: process.env.PW_CHROME_CHANNEL }
            : {}),
          args: runHeaded ? ["--start-maximized"] : [],
          slowMo: process.env.PWSLOWMO
            ? Number(process.env.PWSLOWMO)
            : runHeaded
              ? 250
              : 0,
        },
      },
    },
  ],
});
