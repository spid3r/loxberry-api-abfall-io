#!/usr/bin/env node
/**
 * Cross-platform launcher for the destructive Playwright lifecycle test.
 *
 * Responsibilities:
 *   1. Refuse to run unless the user opts in via --yes-i-am-developer
 *      (or by setting ABFALLIO_ALLOW_DESTRUCTIVE=1).
 *   2. Make sure Playwright's chromium browser is installed locally; if not,
 *      run `npx playwright install chromium` once.
 *   3. Set E2E_LIVE=1 in the spawned environment.
 *   4. Forward the rest of the args to `npx playwright test`.
 *
 * Optional env: E2E_SKIP_UNINSTALL, E2E_POST_UNINSTALL_MS, E2E_POST_INSTALL_MS
 * (see README “Maximum end-to-end test”).
 *
 * The actual .env loading is done by `dotenv-cli` from the npm script, so by
 * the time this launcher runs LOXBERRY_* vars are already in process.env.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const allowFlag =
  argv.includes("--yes-i-am-developer") ||
  process.env.ABFALLIO_ALLOW_DESTRUCTIVE === "1";

if (!allowFlag) {
  process.stderr.write(
    [
      "",
      "WARNING: this is a destructive end-to-end test.",
      "It will UNINSTALL and REINSTALL the abfallio plugin on the LoxBerry",
      "instance defined by LOXBERRY_BASE_URL in your .env file.",
      "",
      "To proceed, either:",
      "",
      "    npm run test:e2e:full:go",
      "",
      "or the long form (same thing):",
      "",
      "    npm run test:e2e:full -- --yes-i-am-developer",
      "",
      "or set ABFALLIO_ALLOW_DESTRUCTIVE=1 in your environment first.",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const required = [
  "LOXBERRY_BASE_URL",
  "LOXBERRY_USERNAME",
  "LOXBERRY_PASSWORD",
  "LOXBERRY_SECURE_PIN",
  "TEST_STREET_QUERY",
];
const missing = required.filter(
  (name) => !process.env[name] || process.env[name].trim() === "",
);
if (missing.length > 0) {
  process.stderr.write(
    `Missing required environment variables in .env: ${missing.join(", ")}\n`,
  );
  process.exit(2);
}

const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

const browserCachePresent = (() => {
  const home = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const candidate =
    home && home !== "0"
      ? home
      : path.join(
          process.env.LOCALAPPDATA ||
            process.env.HOME ||
            process.env.USERPROFILE ||
            repoRoot,
          "ms-playwright",
        );
  if (!fs.existsSync(candidate)) return false;
  try {
    return fs
      .readdirSync(candidate)
      .some((name) => name.toLowerCase().startsWith("chromium"));
  } catch {
    return false;
  }
})();

if (!browserCachePresent) {
  process.stdout.write(
    "Installing Playwright chromium browser (one-time)...\n",
  );
  const install = spawnSync(
    npxBin,
    ["playwright", "install", "chromium"],
    {
      cwd: repoRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

const passthrough = argv.filter((a) => a !== "--yes-i-am-developer");

const isHeaded = passthrough.includes("--headed") || passthrough.includes("--ui");

/** Do not force E2E_HEADED=0 — that made Playwright stay headless; `playwright.config` defaults to a visible window locally (unless E2E_HEADED=0 in `.env`). */
const env = {
  ...process.env,
  E2E_LIVE: "1",
  ...(isHeaded ? { E2E_HEADED: "1" } : {}),
  E2E_VERBOSE: process.env.E2E_VERBOSE ?? (isHeaded ? "1" : "0"),
};

const run = spawnSync(npxBin, ["playwright", "test", ...passthrough], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

process.exit(run.status ?? 1);
