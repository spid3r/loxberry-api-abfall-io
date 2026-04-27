/**
 * Maximum end-to-end lifecycle test for the wasteapiio LoxBerry plugin.
 *
 * What this test does (in order):
 *   1. Builds a fresh release ZIP via `npm run release:zip`.
 *   2. Uninstalls any previously-installed copy of the plugin from the live
 *      LoxBerry appliance (best-effort).
 *   3. Uploads + installs the freshly built ZIP via the loxberry-client CLI.
 *   4. Opens the admin UI in a real browser and forces English (?lang=en).
 *   5. Searches for a street, picks the first result, optionally selects a
 *      house number, and saves the location.
 *   6. Triggers a "Fetch now" and asserts that data is returned and at least
 *      one upcoming category is rendered.
 *   7. Stops. The plugin is intentionally left installed so the operator can
 *      inspect state afterwards (per requirement: "set it up and run the test
 *      and then stop").
 *
 * Guard rails:
 *   - The whole suite is skipped unless E2E_LIVE=1 is set.
 *   - The whole suite is skipped if any of the required .env vars are missing.
 *   - Run only via `npm run test:e2e:full` (loads .env + sets E2E_LIVE=1).
 *
 * THIS IS A DESTRUCTIVE TEST. It uninstalls and reinstalls the plugin on the
 * target LoxBerry. Do NOT run it against production appliances.
 */

import { expect, test } from "@playwright/test";
import {
  E2E_SKIP_UNINSTALL,
  PLUGIN_FOLDER,
  buildReleaseZip,
  e2eSettle,
  getRequiredEnvVarsAvailable,
  uninstallPluginUntilRemoved,
  uploadLatestPluginZipWithRetry,
  waitUntilPluginInList,
} from "./helpers/lifecycle.js";

const E2E_ENABLED = process.env.E2E_LIVE === "1";
const envCheck = getRequiredEnvVarsAvailable();

test.describe("@e2e wasteapiio full plugin lifecycle (destructive)", () => {
  test.skip(
    !E2E_ENABLED,
    "destructive end-to-end test disabled. Set E2E_LIVE=1 (or run `npm run test:e2e:full`) to enable.",
  );
  test.skip(
    E2E_ENABLED && !envCheck.ok,
    `E2E_LIVE=1 but missing required .env vars: ${envCheck.missing.join(", ")}`,
  );

  // Per-step timeout multiplier - some steps (build/upload/install) are slow.
  test.setTimeout(15 * 60 * 1000);

  function logPhase(name: string): void {
    // eslint-disable-next-line no-console
    console.log(`\n[e2e] >>> ${name} ...`);
  }

  test.beforeAll("build release zip", async () => {
    logPhase("phase 1/3: build release zip");
    const result = buildReleaseZip();
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(result.output);
      throw new Error(
        `npm run release:zip failed with exit code ${result.status}`,
      );
    }
    // eslint-disable-next-line no-console
    console.log("[e2e] <<< release zip built");
  });

  test.beforeAll("uninstall any pre-existing plugin", async () => {
    logPhase("phase 2/3: uninstall any pre-existing plugin");
    if (E2E_SKIP_UNINSTALL) {
      // eslint-disable-next-line no-console
      console.log(
        "[e2e] E2E_SKIP_UNINSTALL=1: skipping uninstall (overlapping installs on the same host can still trigger \"Unknown Plugin: The PID does not exist\" from LoxBerry).",
      );
      return;
    }
    // Polls `plugins list` until the folder disappears; logs full CLI output.
    // Env: E2E_UNINSTALL_CMD_ATTEMPTS, E2E_UNINSTALL_WAIT_MS, E2E_UNINSTALL_POLL_MS
    await uninstallPluginUntilRemoved(PLUGIN_FOLDER);
    // Extra buffer after the row is gone (optional; default 12s).
    // Short default: uninstall already blocks until the row is gone; raise via env on slow hardware.
    await e2eSettle("E2E_POST_UNINSTALL_MS", 8_000);
    // eslint-disable-next-line no-console
    console.log("[e2e] <<< uninstalled and verified absent from plugin list");
  });

  test.beforeAll("upload + install fresh build", async () => {
    logPhase("phase 3/3: upload + install fresh build (this can take 1-2 min)");
    const result = await uploadLatestPluginZipWithRetry();
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(result.stderr || result.stdout);
      throw new Error(`plugin upload/install failed: ${result.status}`);
    }
    const installed = await waitUntilPluginInList(PLUGIN_FOLDER);
    // eslint-disable-next-line no-console
    console.log(`[e2e] <<< plugin installed (md5=${installed?.md5 ?? "n/a"})`);
    // Let the plugin daemon and filesystem settle before the browser hits the admin UI.
    await e2eSettle("E2E_POST_INSTALL_MS", 25_000);
  });

  test("admin UI: configure location and fetch live waste data", async ({
    page,
    request,
  }) => {
    const streetQuery = (process.env.TEST_STREET_QUERY ?? "").trim();
    const expectedStreet = (process.env.TEST_STREET_NAME ?? streetQuery).trim();

    // Wait for the admin UI to become reachable post-install.
    const adminUrl = `/admin/plugins/${PLUGIN_FOLDER}/index.php?lang=en&tab=location`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const probe = await request.get(adminUrl, { timeout: 10_000 });
        lastStatus = probe.status();
        if (lastStatus === 200) break;
      } catch {
        // ignore transient failures while LoxBerry finishes installing
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(
      lastStatus,
      `admin UI did not become reachable; last HTTP status was ${lastStatus}`,
    ).toBe(200);

    await page.goto(adminUrl);

    // English UI: server-rendered active panel for ?tab=location (LoxBerry $navbar + our CSS).
    await expect(page.locator("#tab-location.tab-content.active")).toBeVisible({
      timeout: 15_000,
    });

    // Step 1: search the street.
    const search = page.locator("#street-search");
    await expect(search).toBeVisible();
    await search.fill("");
    await search.type(streetQuery, { delay: 30 });

    const results = page.locator("#street-results .search-result");
    await expect(
      results.first(),
      "no street search results returned by api.abfall.io",
    ).toBeVisible({ timeout: 30_000 });

    // Prefer the result that matches TEST_STREET_NAME if provided, otherwise
    // fall back to the first hit.
    const target = expectedStreet
      ? results.filter({ hasText: new RegExp(expectedStreet, "i") }).first()
      : results.first();
    const haveTarget = (await target.count()) > 0;
    await (haveTarget ? target : results.first()).click();

    // Step 2: house number is sometimes required, sometimes not.
    const hnrGroup = page.locator("#hnr-group");
    await page.waitForTimeout(1500);
    if (await hnrGroup.isVisible()) {
      const hnrItems = page.locator("#hnr-results .search-result");
      await expect(hnrItems.first()).toBeVisible({ timeout: 30_000 });
      // Pick the first available house number (the test fixture only requires
      // that *some* valid number is selected; numbers vary per municipality).
      await hnrItems.first().click();
    }

    // Step 3: confirm and save. saveLocation() in the UI takes care of:
    //   - persisting the location (AJAX),
    //   - auto-switching to the Status & Data tab after ~800ms,
    //   - automatically calling doFetch() to trigger a real API call.
    // We must NOT re-click #btn-fetch ourselves or we race with that flow.
    await expect(page.locator("#location-selection")).toBeVisible();
    await page.getByRole("button", { name: /save location/i }).click();

    // The toast added by showAlert() auto-dismisses after 5s and lives as
    // a *direct child* of #tab-status (not inside the empty #status-alert
    // placeholder), so we race a transient success/error alert against the
    // durable status card values.
    const successToast = page
      .locator(
        "#tab-status > .alert.alert-success, #tab-location > .alert.alert-success",
      )
      .first();
    const errorToast = page
      .locator(
        "#tab-status > .alert.alert-error, #tab-location > .alert.alert-error",
      )
      .first();
    const populatedFetchCard = page
      .locator("#status-fetch")
      .filter({ hasNotText: /^[\s-]*$/ })
      .first();

    const outcome = await Promise.race([
      successToast
        .waitFor({ state: "visible", timeout: 180_000 })
        .then(() => "success" as const),
      errorToast
        .waitFor({ state: "visible", timeout: 180_000 })
        .then(async () => ({
          kind: "error" as const,
          text: (await errorToast.innerText()).trim(),
        })),
      populatedFetchCard
        .waitFor({ state: "attached", timeout: 180_000 })
        .then(() => "populated" as const),
    ]);

    if (typeof outcome !== "string" && outcome.kind === "error") {
      throw new Error(
        `LoxBerry UI showed an error toast after save: ${outcome.text}`,
      );
    }

    // Status cards should now reflect a populated dataset (these are durable -
    // the alert toast auto-dismisses after 5s, the cards stick).
    await expect(page.locator("#status-fetch")).not.toHaveText("-", {
      timeout: 30_000,
    });
    await expect(page.locator("#status-count")).not.toHaveText("-", {
      timeout: 30_000,
    });

    const countText = (await page.locator("#status-count").innerText()).trim();
    const categoryCount = parseInt(countText, 10);
    expect(
      Number.isFinite(categoryCount) && categoryCount > 0,
      `expected at least one upcoming category but got '${countText}'`,
    ).toBe(true);

    // Step 5: also exercise the public Loxone Miniserver endpoint so the
    // integration is proven end-to-end and not just inside the admin UI.
    // loxone.php speaks Loxone's flat-text Virtual HTTP Input format, NOT
    // JSON. Three views: default = lines like "<Category>_Days: <n>",
    // ?format=list = "Categories: ...", ?cat=X = a single integer.
    const loxoneFlat = await request.get(`/plugins/${PLUGIN_FOLDER}/loxone.php`, {
      timeout: 30_000,
    });
    expect(loxoneFlat.status()).toBe(200);
    const flatText = (await loxoneFlat.text()).trim();
    expect(
      flatText,
      `loxone.php returned an error/empty body: '${flatText.slice(0, 200)}'`,
    ).toMatch(/_Days:\s*-?\d+/);

    const loxoneList = await request.get(
      `/plugins/${PLUGIN_FOLDER}/loxone.php?format=list`,
      { timeout: 30_000 },
    );
    expect(loxoneList.status()).toBe(200);
    const loxoneListText = (await loxoneList.text()).trim();
    expect(loxoneListText).toMatch(/^Categories:\s*\S/);

    // Public index.php?format=json must return the same cache as loxone (with termine) after fetch.
    const indexSnap = await request.get(
      `/plugins/${PLUGIN_FOLDER}/index.php?format=json`,
      { timeout: 30_000 },
    );
    expect(indexSnap.status()).toBe(200);
    const rawIndex = (await indexSnap.text()).trim();
    const snap = JSON.parse(rawIndex) as {
      termine?: Record<string, unknown>;
      code?: string;
      error?: string;
    };
    if (!snap.termine || Object.keys(snap.termine).length === 0) {
      const pubHdr = indexSnap.headers()["x-wasteapiio-public-index"] ?? "";
      const legacyNoCode = Boolean(
        snap.error && !snap.code && !snap.termine,
      );
      if (legacyNoCode) {
        throw new Error(
          `legacy public index.php on appliance (only error+timestamp; no v2 header was ${pubHdr || "missing"}). Install plugin 1.0.1+ so webfrontend/html/index.php is replaced. sample=${rawIndex.slice(0, 220)}`,
        );
      }
      throw new Error(
        `expected non-empty termine in public index after fetch. hdr=${pubHdr || "—"} sample=${rawIndex.slice(0, 500)}`,
      );
    }
    expect(
      Object.keys(snap.termine).length,
      "at least one category in public JSON",
    ).toBeGreaterThan(0);

    const indexJsonByAccept = await request.get(
      `/plugins/${PLUGIN_FOLDER}/index.php`,
      {
        timeout: 30_000,
        headers: { Accept: "application/json" },
      },
    );
    expect(indexJsonByAccept.status()).toBe(200);
    const snap2 = JSON.parse((await indexJsonByAccept.text()).trim()) as {
      termine?: Record<string, unknown>;
    };
    expect(Object.keys(snap2.termine ?? {}).length).toBeGreaterThan(0);

    const ajaxStatusUrl = `/admin/plugins/${PLUGIN_FOLDER}/ajax.php?action=status`;
    const ajaxLogUrl = `/admin/plugins/${PLUGIN_FOLDER}/ajax.php?action=log`;

    await test.step("ajax: status JSON (incl. mqtt + merged cron install probe)", async () => {
      const st = await request.get(ajaxStatusUrl, { timeout: 30_000 });
      expect(st.status(), "ajax status should return 200").toBe(200);
      const body = (await st.text()).trim();
      const data = JSON.parse(body) as {
        error?: string;
        termine_count?: number;
        mqtt?: { ok?: boolean; last?: string };
        install_cron?: {
          merged_cron_path: string;
          file_exists: boolean;
          replacelb_placeholder_found: boolean;
        } | null;
      };
      expect(data.error, body.slice(0, 300)).toBeUndefined();
      expect(
        typeof data.termine_count === "number" && data.termine_count! > 0,
        "status.termine_count should be > 0 after fetch",
      ).toBe(true);
      expect(data.mqtt, "status should include mqtt object").toBeDefined();
      if (data.install_cron) {
        expect(
          data.install_cron.file_exists,
          `merged LoxBerry cron file should exist at ${data.install_cron.merged_cron_path}`,
        ).toBe(true);
        expect(
          data.install_cron.replacelb_placeholder_found,
          `REPLACELB* must be expanded in merged cron (path ${data.install_cron.merged_cron_path})`,
        ).toBe(false);
      }
    });

    await test.step("settings: default interval, save fuzz, mqtt toggle", async () => {
      await page.goto(`/admin/plugins/${PLUGIN_FOLDER}/index.php?lang=en&tab=settings`);
      if (E2E_SKIP_UNINSTALL) {
        const iv = await page.locator("#fetch-interval").inputValue();
        expect(
          Number(iv),
          "fetch interval (hours) should be 1–168",
        ).toBeGreaterThanOrEqual(1);
        if (iv !== "6") {
          // eslint-disable-next-line no-console
          console.warn(
            `[e2e] #fetch-interval is ${iv} (fresh default is 6) — expected with E2E_SKIP_UNINSTALL=1`,
          );
        }
      } else {
        await expect(page.locator("#fetch-interval")).toHaveValue("6", {
          timeout: 10_000,
        });
      }
      const fuzz = page.locator("#fetch-fuzz");
      const prev = (await fuzz.inputValue()).trim() || "30";
      const next = prev === "31" ? "32" : "31";
      await fuzz.fill(next);
      const mqtt = page.locator("#mqtt-enabled");
      await expect(mqtt).toBeVisible();
      // LoxBerry/jQuery Mobile wraps the checkbox; the label intercepts normal clicks.
      await mqtt.check({ force: true });
      await page
        .getByRole("button", { name: /save settings/i })
        .click();
      const settingsOk = page.locator("#tab-settings .alert-success");
      await expect(settingsOk).toBeVisible({ timeout: 30_000 });

      // MQTT publishes only run inside fetch (Node), not on save — trigger a fetch and assert a publish attempt.
      const fetchNow = await request.get(
        `/admin/plugins/${PLUGIN_FOLDER}/ajax.php?action=fetch_now`,
        { timeout: 120_000 },
      );
      expect(
        fetchNow.status(),
        (await fetchNow.text()).slice(0, 500),
      ).toBe(200);
      const stAfterMqtt = await request.get(ajaxStatusUrl, { timeout: 30_000 });
      const afterMqtt = JSON.parse((await stAfterMqtt.text()).trim()) as {
        mqtt?: { ok?: boolean; last?: string; topics_published?: number; message?: string };
      };
      expect(
        afterMqtt.mqtt?.last,
        `expected mqtt.last after fetch with MQTT on (if ok is false, broker may be down): ${JSON.stringify(afterMqtt.mqtt)}`,
      ).toBeTruthy();
      if (afterMqtt.mqtt && afterMqtt.mqtt.ok === false) {
        // eslint-disable-next-line no-console
        console.warn(
          "[e2e] mqtt.last is set but ok=false (broker unreachable or misconfigured on this host):",
          afterMqtt.mqtt,
        );
      }
      if (afterMqtt.mqtt?.ok === true) {
        expect(
          (afterMqtt.mqtt.topics_published ?? 0) > 0,
          "successful MQTT should report topics_published",
        ).toBe(true);
      }

      await mqtt.uncheck({ force: true });
      await page.getByRole("button", { name: /save settings/i }).click();
      await expect(settingsOk).toBeVisible({ timeout: 30_000 });
    });

    await test.step("log tab: load log", async () => {
      await page.goto(`/admin/plugins/${PLUGIN_FOLDER}/index.php?lang=en&tab=log`);
      await expect(page.locator("#log-content")).not.toContainText("Loading log", {
        timeout: 30_000,
      });
    });

    await test.step("ajax: log action returns JSON", async () => {
      const r = await request.get(ajaxLogUrl, { timeout: 30_000 });
      expect(r.status()).toBe(200);
      const j = (await r.json()) as { log?: string; error?: string };
      expect(j.error, JSON.stringify(j).slice(0, 200)).toBeUndefined();
      expect(typeof j.log === "string", "log action should return { log: string }").toBe(true);
    });

    await test.step("loxone.php ?cat= first category from list", async () => {
      const m = loxoneListText.match(/^Categories:\s*(.+)$/i);
      expect(m, `unexpected list line: ${loxoneListText.slice(0, 200)}`).toBeTruthy();
      const first = (m![1] ?? "").split(",")[0]?.trim() ?? "";
      expect(first.length, "at least one category name in list").toBeGreaterThan(0);
      const one = await request.get(
        `/plugins/${PLUGIN_FOLDER}/loxone.php?cat=${encodeURIComponent(first)}`,
        { timeout: 30_000 },
      );
      expect(one.status()).toBe(200);
      const line = (await one.text()).trim();
      expect(line, "single-category view should be a number line").toMatch(/^\d+$/);
    });

    await test.step("public index: HTML view (de)", async () => {
      const html = await request.get(
        `/plugins/${PLUGIN_FOLDER}/index.php?view=html&lang=de`,
        { timeout: 30_000 },
      );
      expect(html.status()).toBe(200);
      const t = await html.text();
      expect(t).toMatch(/Abfallabholung|api\.abfall\.io/);
    });

    await test.step("de admin: Standort tab label", async () => {
      await page.goto(
        `/admin/plugins/${PLUGIN_FOLDER}/index.php?lang=de&tab=location`,
      );
      await expect(
        page.locator('a[href*="tab=location"]'),
      ).toContainText(/standort/i, { timeout: 15_000 });
    });
  });
});
