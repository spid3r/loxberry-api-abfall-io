/**
 * E2E-only glue around the **loxberry-client** CLI — not a second client.
 *
 * The CLI only runs one-off commands. The test harness also needs: stable
 * `.env` loading on Windows/CI, JSON from `plugins list`, `plugins uninstall`
 * with **row `md5` as pid** (folder name is wrong on stock LoxBerry), `npm run
 * release:zip` before deploy, **polling** until the plugin row disappears or
 * appears, and **retries** when deploy/install logs show temp-zip races. That
 * orchestration does not live in loxberry-client; it stays here so specs stay
 * thin.
 */

import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const PLUGIN_FOLDER = (process.env.PLUGIN_FOLDER || "abfallio").trim();
export const ENV_FILE = path.join(REPO_ROOT, ".env");

const CLI_PATH = path.join(
  REPO_ROOT,
  "node_modules",
  "loxberry-client-library",
  "dist",
  "cli.cjs",
);

interface PluginListRow {
  folder?: string;
  name?: string;
  md5?: string;
}

export type PluginListResult =
  | { ok: true; rows: PluginListRow[] }
  | { ok: false; error: string };

const VERBOSE = process.env.E2E_VERBOSE === "1";

/** If set, skip uninstall before install (avoids LoxBerry race emails when iterating on the same box). */
export const E2E_SKIP_UNINSTALL = process.env.E2E_SKIP_UNINSTALL === "1";

export function e2eMsFromEnv(name: string, defaultMs: number): number {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultMs;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : defaultMs;
}

/**
 * Optional delay so LoxBerry can finish internal plugin state changes before the next step.
 * Override with e.g. E2E_POST_UNINSTALL_MS=30000
 */
/** Avoid flooding CI logs with full LoxBerry HTML admin pages (CLI sometimes echoes them on stdout). */
function formatCliForLog(raw: string, max = 2_000): string {
  const s = raw.trim();
  if (!s) return "(no output)";
  const head = s.slice(0, 500).toLowerCase();
  if (head.includes("<!doctype") || (s.startsWith("<") && head.includes("html"))) {
    return `(HTML response, ${s.length} bytes; not echoed)`;
  }
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function e2eSettle(
  name: "E2E_POST_UNINSTALL_MS" | "E2E_POST_INSTALL_MS",
  defaultMs: number,
): Promise<void> {
  const ms = e2eMsFromEnv(name, defaultMs);
  if (VERBOSE && ms > 0) {
    process.stdout.write(`[e2e] ${name}=${ms}ms\n`);
  }
  if (ms > 0) {
    await new Promise((r) => setTimeout(r, ms));
  }
}

function runNode(
  args: string[],
  options: SpawnSyncOptions = {},
): { status: number; stdout: string; stderr: string } {
  const baseArgs = fs.existsSync(ENV_FILE)
    ? ["--env-file=" + ENV_FILE, ...args]
    : args;
  if (VERBOSE) {
    process.stdout.write(`> node ${baseArgs.join(" ")}\n`);
  }
  // Always capture (pipe) so callers can parse JSON output. When VERBOSE is
  // set we also echo the captured output afterwards so the user sees progress.
  const proc = spawnSync(process.execPath, baseArgs, {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: "pipe",
    ...options,
  });
  const toText = (v: string | Buffer | null | undefined): string => {
    if (v == null) return "";
    if (Buffer.isBuffer(v)) return v.toString("utf-8");
    return v;
  };
  const stdout = toText(proc.stdout);
  const stderr = toText(proc.stderr);
  if (VERBOSE) {
    if (stdout) process.stdout.write(stdout.endsWith("\n") ? stdout : stdout + "\n");
    if (stderr) process.stderr.write(stderr.endsWith("\n") ? stderr : stderr + "\n");
  }
  return { status: proc.status ?? 1, stdout, stderr };
}

/**
 * `plugins list` with status — the old helper returned `[]` on *any* failure,
 * which made a broken CLI look like “no plugins” and skip uninstall.
 */
export function listInstalledPluginsDetailed(): PluginListResult {
  if (!fs.existsSync(CLI_PATH)) {
    return { ok: false, error: "loxberry-client cli.cjs not found" };
  }
  const res = runNode([CLI_PATH, "plugins", "list"]);
  if (res.status !== 0) {
    return {
      ok: false,
      error: `plugins list exit ${res.status}: ${(res.stderr || res.stdout).slice(0, 2000)}`,
    };
  }
  try {
    const parsed = JSON.parse(res.stdout || "[]");
    return {
      ok: true,
      rows: Array.isArray(parsed) ? (parsed as PluginListRow[]) : [],
    };
  } catch (e) {
    return { ok: false, error: `plugins list parse: ${e}` };
  }
}

export function listInstalledPlugins(): PluginListRow[] {
  const d = listInstalledPluginsDetailed();
  return d.ok ? d.rows : [];
}

export function isPluginInstalled(folder: string = PLUGIN_FOLDER): boolean {
  const d = listInstalledPluginsDetailed();
  if (!d.ok) {
    if (VERBOSE) {
      process.stderr.write(
        `[e2e] isPluginInstalled: list failed (${d.error.slice(0, 200)}…), assuming "maybe" — will still try uninstall.\n`,
      );
    }
    // Conservative: on list failure, do not report "not installed" (avoids
    // skipping uninstall when the API errors).
    return true;
  }
  return d.rows.some((row) => row?.folder === folder);
}

/**
 * LoxBerry `plugininstall.cgi?do=uninstall&pid=` expects the **plugin row md5**,
 * not the folder name. Calling `--name abfallio` only hits the list page and
 * does not remove the plugin (HTML response, 200). Always pass the md5 from
 * `plugins list`.
 */
export function uninstallPlugin(
  folder: string = PLUGIN_FOLDER,
): { status: number; stdout: string; stderr: string } {
  const d = listInstalledPluginsDetailed();
  if (!d.ok) {
    return {
      status: 1,
      stdout: "",
      stderr: d.error,
    };
  }
  const row = d.rows.find((r) => (r?.folder ?? "").trim() === folder);
  const pid = row?.md5?.trim();
  if (!pid) {
    return {
      status: 1,
      stdout: "",
      stderr: `E2E: no md5 in plugins list for folder '${folder}' (cannot run stock uninstall)`,
    };
  }
  if (VERBOSE) {
    process.stdout.write(
      `[e2e] plugins uninstall using pid (md5) ${pid.slice(0, 10)}… for folder ${folder}\n`,
    );
  }
  return runNode([CLI_PATH, "plugins", "uninstall", "--name", pid]);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hasFolder(rows: PluginListRow[], folder: string): boolean {
  return rows.some((r) => (r?.folder ?? "").trim() === folder);
}

/**
 * After `plugins upload`, the CLI can exit 0 before `plugins list` shows the new
 * row. Polls like uninstall settle (see E2E_INSTALL_WAIT_MS).
 */
export async function waitUntilPluginInList(
  folder: string = PLUGIN_FOLDER,
): Promise<PluginListRow> {
  const waitMs = e2eMsFromEnv("E2E_INSTALL_WAIT_MS", 120_000);
  const pollMs = e2eMsFromEnv("E2E_INSTALL_POLL_MS", 750);
  const deadline = Date.now() + waitMs;
  let lastListErr: string | null = null;
  // eslint-disable-next-line no-console
  console.log(
    `[e2e] waiting for '${folder}' in plugins list (up to ${waitMs}ms, poll ${pollMs}ms)…`,
  );
  while (Date.now() < deadline) {
    const d = listInstalledPluginsDetailed();
    if (d.ok) {
      const row = d.rows.find((r) => (r?.folder ?? "").trim() === folder);
      if (row) return row;
    } else {
      lastListErr = d.error;
    }
    await sleepMs(pollMs);
  }
  const snap = listInstalledPluginsDetailed();
  const detail = snap.ok
    ? `got ${snap.rows.length} row(s), folders=[${snap.rows
        .map((r) => r?.folder)
        .filter(Boolean)
        .join(", ")}]`
    : snap.error;
  throw new Error(
    `E2E: plugin '${folder}' not in 'plugins list' within ${waitMs}ms after upload. ` +
      (lastListErr ? `intermittent list error: ${lastListErr}. ` : "") +
      `last snapshot: ${detail}`,
  );
}

/**
 * Runs `plugins uninstall` (possibly several times) and **polls `plugins list`**
 * until the plugin row disappears or a timeout is hit. This matches what you
 * see in the UI: the CLI can return 0 while LoxBerry still shows the plugin
 * for a few seconds, or return non-zero even when uninstall eventually
 * completes.
 */
export async function uninstallPluginUntilRemoved(
  folder: string = PLUGIN_FOLDER,
): Promise<void> {
  const rawAttempts = process.env.E2E_UNINSTALL_CMD_ATTEMPTS;
  const nA =
    rawAttempts != null && String(rawAttempts).trim() !== ""
      ? Number(rawAttempts)
      : NaN;
  const cmdAttempts = Number.isFinite(nA)
    ? Math.max(1, Math.min(10, Math.floor(nA)))
    : 3;
  const waitMs = e2eMsFromEnv("E2E_UNINSTALL_WAIT_MS", 120_000);
  const pollMs = e2eMsFromEnv("E2E_UNINSTALL_POLL_MS", 750);

  for (let a = 0; a < cmdAttempts; a++) {
    const fresh = listInstalledPluginsDetailed();
    if (fresh.ok && !hasFolder(fresh.rows, folder)) {
      // eslint-disable-next-line no-console
      console.log(
        `[e2e] plugin '${folder}' not in plugins list (already absent).`,
      );
      return;
    }
    if (!fresh.ok) {
      // eslint-disable-next-line no-console
      console.warn(
        `[e2e] plugins list failed (will still try uninstall): ${fresh.error.slice(0, 400)}`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(
        `[e2e] uninstall cmd attempt ${a + 1}/${cmdAttempts} for '${folder}' (present in list).`,
      );
    }

    const r = uninstallPlugin(folder);
    const out = (r.stdout || r.stderr || "").trim();
    // eslint-disable-next-line no-console
    console.log(
      `[e2e] loxberry-client plugins uninstall (pid=md5 from list, folder=${folder}) → exit ${r.status} — ${formatCliForLog(out)}`,
    );

    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      const again = listInstalledPluginsDetailed();
      if (again.ok && !hasFolder(again.rows, folder)) {
        // eslint-disable-next-line no-console
        console.log(
          `[e2e] plugin '${folder}' removed from list after uninstall (polled; wait up to ${waitMs}ms per attempt).`,
        );
        return;
      }
      if (!again.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[e2e] poll list failed: ${again.error.slice(0, 200)}`,
        );
      }
      await sleepMs(pollMs);
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[e2e] plugin '${folder}' still listed after ${waitMs}ms; will retry uninstall if attempts left.`,
    );
  }

  const last = listInstalledPluginsDetailed();
  const still = last.ok && hasFolder(last.rows, folder);
  const listDump = last.ok
    ? JSON.stringify(last.rows, null, 0).slice(0, 1_500)
    : last.error;
  throw new Error(
    `E2E: plugin '${folder}' is still in 'plugins list' after ${cmdAttempts} uninstall attempt(s) and ${waitMs}ms each. Last list: ${listDump}`,
  );
}

export function buildReleaseZip(): { status: number; output: string } {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  if (VERBOSE) process.stdout.write("> npm run release:zip\n");
  // For the build we do want live streaming so the user can see progress;
  // we don't need to parse the output.
  const proc = spawnSync(npmCmd, ["run", "release:zip"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    stdio: VERBOSE ? "inherit" : "pipe",
    shell: process.platform === "win32",
  });
  return {
    status: proc.status ?? 1,
    output: (proc.stdout ?? "") + (proc.stderr ?? ""),
  };
}

export function findLatestPluginZip(): string | null {
  const distDir = path.join(REPO_ROOT, "dist");
  if (!fs.existsSync(distDir)) return null;
  const entries = fs
    .readdirSync(distDir)
    .filter((n) => /^loxberry-plugin-abfallio-.*\.zip$/.test(n))
    .map((n) => path.join(distDir, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return entries[0] ?? null;
}

export function uploadLatestPluginZip(): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const zip = findLatestPluginZip();
  if (!zip) {
    return {
      status: 1,
      stdout: "",
      stderr: "no release ZIP found in dist/",
    };
  }
  // `plugins deploy` includes md5 before/after handling for flaky HTTP responses.
  return runNode([CLI_PATH, "plugins", "deploy", "--project", REPO_ROOT]);
}

/** Heuristic: loxberry-client followed the install log but LoxBerry reported a bad/missing temp zip. */
function deployOutputLooksLikeInstallFailure(combined: string): boolean {
  const s = combined.toLowerCase();
  return (
    s.includes("error while extracting from plugin archive") ||
    (s.includes("cannot find or open") && s.includes(".zip")) ||
    s.includes("plugin install log reports failure")
  );
}

/**
 * After an uninstall, LoxBerry sometimes starts the install step before the uploaded
 * file exists at the path the server passes to `unzip` — a full retry usually succeeds.
 * Env: `E2E_DEPLOY_MAX_ATTEMPTS` (default 6), `E2E_DEPLOY_RETRY_MS` (default 8000).
 */
export async function uploadLatestPluginZipWithRetry(): Promise<{
  status: number;
  stdout: string;
  stderr: string;
}> {
  const rawN = process.env.E2E_DEPLOY_MAX_ATTEMPTS?.trim();
  const maxAttempts =
    rawN && /^\d+$/.test(rawN)
      ? Math.min(12, Math.max(1, parseInt(rawN, 10)))
      : 6;
  const retryDelayMs = e2eMsFromEnv("E2E_DEPLOY_RETRY_MS", 8_000);

  let last: ReturnType<typeof uploadLatestPluginZip> = {
    status: 1,
    stdout: "",
    stderr: "",
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      process.stdout.write(
        `[e2e] plugins deploy retry ${attempt}/${maxAttempts} after ${retryDelayMs}ms (LoxBerry temp-upload race)…\n`,
      );
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    last = uploadLatestPluginZip();
    const combined = `${last.stdout}\n${last.stderr}`;
    const looksBad = deployOutputLooksLikeInstallFailure(combined);
    if (last.status === 0 && !looksBad) {
      return last;
    }
    if (last.status !== 0 || looksBad) {
      const reason =
        last.status !== 0 ? `exit ${last.status}` : "install log reports failure";
      process.stderr.write(
        `[e2e] deploy attempt ${attempt}/${maxAttempts} (${reason})${looksBad ? " [matched install-failure heuristics]" : ""}\n`,
      );
    }
  }
  return last;
}

export function getEnvOrThrow(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`required environment variable ${name} is missing`);
  }
  return v.trim();
}

export function getRequiredEnvVarsAvailable(): {
  ok: boolean;
  missing: string[];
} {
  const required = [
    "LOXBERRY_BASE_URL",
    "LOXBERRY_USERNAME",
    "LOXBERRY_PASSWORD",
    "LOXBERRY_SECURE_PIN",
    "TEST_STREET_QUERY",
  ];
  const missing = required.filter(
    (name) => !process.env[name] || process.env[name]!.trim() === "",
  );
  return { ok: missing.length === 0, missing };
}
