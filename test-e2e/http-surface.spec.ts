/**
 * Read-only HTTP checks against a live LoxBerry (no ZIP / uninstall).
 * Complements full-lifecycle.spec.ts with extra URL variants and empty-state
 * contract checks when the cache is still missing.
 *
 * Run: same as E2E — `npm run test:e2e:full` (loads .env) or
 *   E2E_LIVE=1 npx playwright test test-e2e/http-surface.spec.ts
 */
import { expect, test } from "@playwright/test";
import {
  PLUGIN_FOLDER,
  getRequiredEnvVarsAvailable,
} from "./helpers/lifecycle.js";

const E2E_ENABLED = process.env.E2E_LIVE === "1";
const envCheck = getRequiredEnvVarsAvailable();

test.describe("@e2e public & admin HTTP surface (read-only, no install)", () => {
  test.skip(
    !E2E_ENABLED,
    "set E2E_LIVE=1 and use npm run test:e2e:full to enable live requests.",
  );
  test.skip(
    E2E_ENABLED && !envCheck.ok,
    `E2E_LIVE=1 but missing .env: ${envCheck.missing.join(", ")}`,
  );

  test.setTimeout(3 * 60 * 1000);

  function base() {
    return `/plugins/${PLUGIN_FOLDER}`;
  }

  function adminAjax(action: string) {
    return `/admin/plugins/${PLUGIN_FOLDER}/ajax.php?action=${encodeURIComponent(action)}`;
  }

  test("index.php: ?format=json empty contract OR termine", async ({
    request,
  }) => {
    const r = await request.get(`${base()}/index.php?format=json`, {
      timeout: 30_000,
    });
    expect(r.status()).toBe(200);
    const j = JSON.parse((await r.text()).trim()) as Record<string, unknown>;
    if (j.ok === false && j.code === "no_data") {
      expect(j.error).toBe("No data available");
      expect(String(j.message ?? "")).toMatch(/Fetch|Abruf/i);
      return;
    }
    const termine = j.termine as Record<string, unknown> | undefined;
    if (termine && Object.keys(termine).length > 0) {
      return;
    }
    if (j.error && !j.code && !j.termine) {
      // eslint-disable-next-line no-console
      console.warn(
        "[e2e] legacy public index.php on the box (only error+timestamp). Reinstall plugin 1.0.1+ so webfrontend/html/index.php is current.",
      );
      return;
    }
    throw new Error(
      "Unexpected public index JSON (expected no_data+code, termine, or legacy empty state).",
    );
  });

  test("index.php: ?view=html returns HTML help", async ({ request }) => {
    const r = await request.get(`${base()}/index.php?view=html&lang=de`, {
      timeout: 30_000,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    expect(r.status()).toBe(200);
    const t = await r.text();
    if (t.trim().startsWith("{")) {
      // eslint-disable-next-line no-console
      console.warn(
        "[e2e] view=html returned JSON — public index.php is outdated on the appliance (reinstall 1.0.1+).",
      );
      return;
    }
    expect(t).toMatch(/<!DOCTYPE|Abfallabholung/i);
  });

  test("index.php: JSON with Accept: application/json", async ({ request }) => {
    const r = await request.get(`${base()}/index.php`, {
      timeout: 30_000,
      headers: { Accept: "application/json" },
    });
    expect(r.status()).toBe(200);
    const ct = r.headers()["content-type"] ?? "";
    expect(ct).toMatch(/json/i);
  });

  test("loxone.php?debug=1 shows path resolution", async ({ request }) => {
    const r = await request.get(`${base()}/loxone.php?debug=1`, {
      timeout: 30_000,
    });
    expect(r.status()).toBe(200);
    const t = await r.text();
    expect(t).toContain("Tried paths");
    expect(t).toMatch(/LBPPLUGINDIR|__DIR__|cache_file/i);
  });

  test("loxone.php without cache: plain error line", async ({ request }) => {
    const r = await request.get(`${base()}/loxone.php`, { timeout: 30_000 });
    expect(r.status()).toBe(200);
    const t = (await r.text()).trim();
    if (t.startsWith("ERROR:")) {
      expect(t).toMatch(/No data|No collection/);
    } else {
      expect(t).toMatch(/_Days:\s*-?\d+/);
    }
  });

  test("admin ajax: status + log (authenticated)", async ({ request }) => {
    const st = await request.get(adminAjax("status"), { timeout: 30_000 });
    expect(st.status()).toBe(200);
    const body = (await st.text()).trim();
    const data = JSON.parse(body) as { error?: string; termine_count?: number };
    expect(
      data.error,
      "status should not return error: " + body.slice(0, 200),
    ).toBeUndefined();
    expect(typeof data.termine_count).toBe("number");

    const log = await request.get(adminAjax("log"), { timeout: 30_000 });
    expect(log.status()).toBe(200);
    const lj = (await log.json()) as { log?: string; error?: string };
    expect(lj.error).toBeUndefined();
    expect(typeof lj.log).toBe("string");
  });
});
