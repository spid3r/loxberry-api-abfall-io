# loxberry-api-abfall-io

[![CI](https://github.com/spid3r/loxberry-api-abfall-io/actions/workflows/ci.yml/badge.svg)](https://github.com/spid3r/loxberry-api-abfall-io/actions/workflows/ci.yml)
[![Release](https://github.com/spid3r/loxberry-api-abfall-io/actions/workflows/release.yml/badge.svg)](https://github.com/spid3r/loxberry-api-abfall-io/actions/workflows/release.yml)

LoxBerry 3 plugin that retrieves waste-collection schedules from
[`api.abfall.io`](https://api.abfall.io/) and exposes them as JSON, flat-text
(Loxone) and MQTT topics.

**Disclaimer (read this):** This project is **not** official,
**not** endorsed by the api.abfall.io / AbfallPlus operators, and **there is no support obligation** from them or from
the maintainers. It is a **community best-effort** tool using **publicly accessible** HTTP usage, with a **minimum
6-hour** interval between scheduled fetches to avoid placing unnecessary load on upstream servers. The service may
**change or stop at any time**. Full text: **[DISCLAIMER.md](./DISCLAIMER.md)** (German and English).

## Features

- **Admin UI in German and English** (plugin strings, help texts, and the in-page quick guide). The data is for
  German municipal schedules, but the UI can stay in English if you prefer.
  Language is chosen from the **Language** dropdown (or `?lang=de` / `?lang=en` on the first request; then cookie, plugin
  `config/abfall.json`, LoxBerry system language, and `Accept-Language`). If nothing matches, **German** is the default.
  The **Status** tab starts with
  a short “how to use” block for new users. In normal operation the page is **embedded in the LoxBerry shell**
  (like other plugins).
- Street and house-number lookup against `api.abfall.io`
- Scheduled background fetch via cron: **minimum fetch interval 6 hours** (configurable upward to 168 hours) plus a **fuzz factor**
  (random ± minutes, default 30) so the API is not hit on the same minute by
  every LoxBerry running this plugin
- JSON from the admin/ajax API (`htmlauth/ajax.php`); optional **JSON snapshot**
  from `plugins/.../index.php?format=json` (without `?format=json`, the same URL
  shows a simple help page in a browser). Loxone **flat text** from
  `webfrontend/html/loxone.php`
- Plugin list icon: `plugin.cfg` references `webfrontend/html/icon_64.png`;
  all four `icons/icon_{64,128,256,512}.png` are generated in `release:zip`
  from a single source (see *Building* below)
- Optional category filtering
- Optional **MQTT publishing** to LoxBerry's built-in broker, with
  auto-detection of broker credentials from
  `${LBHOMEDIR}/config/system/general.json` (configurable topic prefix,
  retain flag, QoS 1)

## Data source: what is “the API mode”?

This plugin has **a single data path**: the public service [`api.abfall.io`](https://api.abfall.io/) used by many
municipal waste sites. There is **no alternate backend** to pick in the UI. The status line **Data source** simply
names that service (it is *not* a mode selector). Schedules are downloaded as a **web calendar (ICS / iCal)** in
the background, then normalised; you do not manage ICS files yourself. You do **not** need a personal account
on api.abfall.io. Each municipality or provider on abfall.io has its own **32-character hex service key**
(the same as on their “Abfuhrtermine” web app). **You must choose your region** on the **Location** tab first
(autocomplete list or expert key), then **Save region & settings**; there is **no hidden default city** — until a
key is saved, street search and fetch are disabled.
You can read the key from the browser’s **Network** tab when triggering an **ICS export** on your local waste
schedule page, or use community docs (e.g. Home Assistant’s [abfall.io source
notes](https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/doc/source/abfall_io.md)). Then search
your street on the same **Location** tab (below the region block).

## Which municipalities and providers are supported in the UI?

**Scope of this plugin:** only waste schedules that are reachable via
[`api.abfall.io`](https://api.abfall.io/) (same public API that many local “Abfuhr / Abfall”
websites use). There is **no** single official “all Germany” API from abfall.io; the plugin
therefore does **not** know every city by magic.

**What the admin UI actually lists:** on the **Standort / Location** tab (with the region search) you will find a
block *“Which regions work?”* (collapsible) with **every `service` name** in the current autocomplete
data file — that is the explicit answer to *“which municipalities work in this list”*.

- **Source of the names:** a community-curated list aligned with the Home Assistant
  [`waste_collection_schedule`](https://github.com/mampfes/hacs_waste_collection_schedule) /
  *AbfallIO* `SERVICE_MAP` (and the `AbfallIO.py` file the plugin can download when you
  use **“Update region list online”**).
- **Shipped file:** `data/abfallio-service-map.json` in the plugin tree (bundled in the ZIP).
- **Override after an online refresh:** the updated copy in the LoxBerry **plugin data**
  directory: `<LBHOMEDIR>/data/plugins/<FOLDER>/abfallio-service-map.json` (takes
  precedence if present).
- **Your town not in the list?** The operator can still be on abfall.io — use the **expert**
  32-hex *service key* and then pick your address on the *Location* tab. Operators that do
  **not** use abfall.io are **out of scope** (different backends would need separate
  integrations, like the many other *sources* in the Home Assistant project above).

## Public help page and languages

If you open `plugins/<folder>/index.php` in a browser, you get a **short, translated help** page (or force it with
`?view=html`). The same strings live in `templates/lang/language_de.ini` and `language_en.ini` as the admin UI. To switch language, add
`?lang=de` or `?lang=en`. For machines and `curl`, use `?format=json` (as described below).

## Installation

### On a LoxBerry appliance

1. Download the latest plugin ZIP from the
   [GitHub releases page](https://github.com/spid3r/loxberry-api-abfall-io/releases).
2. Install it in LoxBerry under *System ▸ Plugins*.
3. Open the plugin, **Location** — pick your **waste region** (or enter a service key) and **Save region & settings**;
   then search your street and save, *Status* — **Fetch now** to test.

**First time (absolute beginner):** (1) *Location* — region + save (same action stores interval/MQTT defaults too). (2) same tab — street, save. (3) *Status* —
**Fetch now** and wait for dates. (4) Optional: *Settings* for interval (≥6 h), filter, MQTT, Loxone/JSON. If
something fails, read the *Log* tab. The *Status* data card **Data source** is informational only. See
[DISCLAIMER.md](./DISCLAIMER.md) for limitations and “no support” wording.

### Local development checks

```bash
git clone https://github.com/spid3r/loxberry-api-abfall-io.git
cd loxberry-api-abfall-io
npm install
npm run typecheck
npm test
npm run build
```

**Full local gate (same as CI: types + unit tests + release ZIP + zip sanity + Playwright spec load; destructive E2E against a real LoxBerry stays opt-in):**

```bash
npm run test:all
```

**Develop `loxberry-client-library` side-by-side** (sibling clone): after changes in the library, run `npm run link:client-lib` — it builds the library, runs `npm link` / `npm link loxberry-client-library`, then you use the same `node_modules` resolution as a global link. Run it again whenever you pull or change the client library.

You can drive the bundled CLI directly:

```bash
node bin/abfall_api.cjs status
node bin/abfall_api.cjs search_street "main"
node bin/abfall_api.cjs search_hnr "<street_id>"
node bin/abfall_api.cjs fetch
node bin/fetch.cjs --force
```

## Configuration

### 1) Location (region, then address)

In the plugin UI open the *Standort* / *Location* tab:

- Choose your **waste region** (autocomplete) or the expert **service key**, then **Save region & settings**
- **Then** search a street (min. 3 characters)
- Pick a house number if the API requires one
- **Save location**

### 2) Fetch interval & fuzz factor

In *Einstellungen* / *Settings*:

- **Fetch interval (hours)** — how often `fetch.cjs` may hit the upstream API.
  The default for a new install is **6 hours** (override in the UI or in
  `config/abfall.json` before building the plugin ZIP).
- **Fuzz factor (± minutes)** — random offset added to the interval so 1000
  appliances don't all poll at HH:00:00. Defaults to ±30 min, set to 0 to
  disable.

The cron job runs hourly at minute 17 and `fetch.cjs` skips itself until the
configured interval *plus* the random offset has elapsed.

### 3) MQTT publishing (optional)

Toggle *Daten nach jedem Abruf per MQTT veröffentlichen* and either let the
plugin auto-detect the LoxBerry broker or fill in custom host/port/credentials.
After every successful fetch the plugin publishes (retained, QoS 1):

```text
<prefix>/state                              # full JSON snapshot
<prefix>/last_fetch                         # "YYYY-MM-DD HH:MM:SS"
<prefix>/location                           # human readable street
<prefix>/categories_count                   # number of upcoming categories
<prefix>/categories/<slug>/days             # days until next pickup
<prefix>/categories/<slug>/date             # next pickup date (DD.MM.YYYY)
<prefix>/categories/<slug>/weekday          # weekday name
<prefix>/categories/<slug>/weekday_num     # 1=Monday .. 7=Sunday
<prefix>/categories/<slug>/category         # original category label
```

Default prefix is `loxberry/abfallio`. German umlauts in category names are
folded to ASCII (`Grünabfall` → `gruenabfall`).

### 4) Loxone Miniserver

Add a Virtual HTTP Input pointing at:

- `http://<loxberry-ip>/plugins/abfallio/loxone.php` — flat output for all categories
- `http://<loxberry-ip>/plugins/abfallio/loxone.php?cat=<category>` — single category
- `http://<loxberry-ip>/plugins/abfallio/loxone.php?format=list` — category list

**JSON snapshot (optional):**  
`http://<loxberry-ip>/plugins/abfallio/index.php?format=json` — same cache file as above, for tools that want JSON.  
`.../index.php?view=html` — short help page in **DE** or **EN**; use `?lang=de` or `?lang=en`.
  Normal browsers also get HTML if `text/html` is in `Accept` and `?format=json` is not used.

After a **major plugin update** on the box, if `index.php?format=json` still looks wrong while `loxone.php` is fine, uninstall the plugin and install the new ZIP once (LoxBerry can leave an old public `index.php` behind when the version number did not change).

Polling interval: `3600` (once per hour).

## JSON format

```json
{
  "timestamp": "2026-04-26 09:49:20",
  "location": "Example Street 7",
  "termine": {
    "Paper": {
      "tage": 5,
      "datum": "30.04.2026",
      "wochentag": "Thursday",
      "wochentag_num": 4
    },
    "Residual Waste": {
      "tage": 12,
      "datum": "07.05.2026",
      "wochentag": "Thursday",
      "wochentag_num": 4
    }
  },
  "next_fetch_due": "2026-04-27 09:53:38",
  "next_fetch_offset_minutes": -7,
  "mqtt": { "ok": true, "last": "2026-04-26 09:49:21", "topics_published": 36 }
}
```

## Architecture

- **Backend** — TypeScript (Node.js 20+), ESM, bundled with `esbuild` to a
  single file under `dist-node/cli/`. A post-build copy mirrors that tree to
  `bin/dist-node/` so `bin/*.cjs` shims and the LoxBerry ZIP all use the same
  relative `require` paths, without a `node_modules/` directory on the appliance.
- **Frontend** — LoxBerry-native PHP pages (`webfrontend/htmlauth/index.php`,
  `webfrontend/htmlauth/ajax.php`) that shell out to the Node CLI for
  business logic.
- **i18n** — `webfrontend/htmlauth/i18n.php` resolves the active language
  (URL ▸ cookie ▸ plugin config ▸ LoxBerry system ▸ Accept-Language ▸ default **German**)
  and loads `templates/lang/language_de.ini` / `language_en.ini` (see Features). The public `webfrontend/html/index.php` uses static `public_help_de.html` / `public_help_en.html` for the browser help view.
- **Tests** — Mocha + Chai, run via the `tsx` runtime. Unit tests for the parser, paths,
  category filter, fuzz scheduler and MQTT publisher; opt-in live mocha smoke test that exercises
  a real appliance over HTTP. A separate, destructive Playwright lifecycle test
  in `test-e2e/` performs uninstall + install + UI fetch, then (with MQTT enabled)
  a `fetch_now` that must record an `mqtt.last` timestamp (success `ok: true` depends
  on a reachable broker). It is opt-in only (see *Maximum end-to-end test* below).
  Full line coverage is not a goal: edge cases in PHP templates or rare API failures
  are not all exercised in CI.

```text
src-ts/        TypeScript sources
  cli/         CLI entrypoints (abfall_api.ts, fetch.ts)
  lib/         logic (paths, abfall-service, mqtt-publisher, types, logger)
test-ts/       Mocha specs
test-e2e/      Destructive Playwright lifecycle test (opt-in only)
webfrontend/   LoxBerry-native PHP UI / endpoints
templates/     language files
config/        default plugin config shipped with the ZIP
bin/           CommonJS shims (`.cjs`) that `require` `dist-node/cli/*` (mirrored on build; same layout in the ZIP)
scripts/       build, packaging and dev tooling
.github/       CI + semantic-release workflows
```

## Local UI checks

UI checks and screenshots are performed against a real configured LoxBerry appliance (see `.env`)
via Playwright (`npm run wiki:screenshots` and `npm run wiki:screenshots:watch`).

The dev server listens on `http://localhost:8080`.

## Building the release ZIP

```bash
npm install
npm run release:zip
```

This runs `build:icons` (resizes the artwork under `icons/` to the four
LoxBerry sizes, writes `webfrontend/html/icon_64.png` for the management UI),
`build` (esbuild bundles for `bin/`), then `build-release` (ZIP).

The artifact lands in `dist/loxberry-plugin-abfallio-<version>.zip` and is
the file you upload to LoxBerry. The build excludes `src-ts/`, `test-ts/`,
`scripts/`, `node_modules/`, dotfiles and the `.playwright-mcp/` working
folder.

**Icon art:** the theme is a waste/wheelie-bin + collection calendar (suitable
for `api.abfall.io`). To change branding, replace the largest sharp-readable PNG
in `icons/` and re-run `npm run build:icons` before a release.

## Optional live appliance testing

This repository uses the CLI from
[`loxberry-client-library`](https://github.com/spid3r/loxberry-client-library)
(`file:../loxberry-client-library` in `package.json` when the repo is next to
that checkout) to install/uninstall the plugin. A plain `plugins upload --file` **without**
`--wait-install` still outputs the first HTML response; **`npm run test:live` / `npm run plugins:deploy`** run
`loxberry-client plugins deploy --project .`, which uses **`plugins deploy`** in the
library: newest `dist/loxberry-plugin-*.zip`, **`FOLDER=`** from `plugin.cfg`, then
`--wait-install` + list wait, plus an **md5-change fallback** for flaky responses. After you
publish a new library version, bump the dependency and run `npm update loxberry-client-library`.

**Repo layout:** clone `loxberry-api-abfall-io` and `loxberry-client-library` as
siblings, then `npm install` in the plugin repo. `npm run use:local-client-library`
re-links the local library. To publish, bump and release
`loxberry-client-library` first, then you can point this package at the npm
version instead of `file:..` if you prefer.

1. Build the plugin ZIP: `npm run release:zip`
2. Copy `.env.example` to `.env` and fill in your appliance credentials and
   SecurePIN. **`.env` is gitignored.**
3. Run any of:
   - `npm run plugins:list`
   - `npm run test:live` (build ZIP + `plugins deploy` to the box)
   - `npm run plugins:deploy` (upload latest ZIP only, same as the old `plugins:upload:latest` name)
   - `npm run test:live:street` (street search + config save + fetch smoke test)
   - `npm run test:live:full` (same + uninstall the plugin folder)
   - `npm run e2e:appliance:go` — alias for the **destructive** Playwright gate
     (`npm run test:e2e:full:go`: build ZIP, uninstall, deploy with **retries**, UI test). No extra
     pre-upload: the suite already builds and installs a fresh copy; a prior `plugins:deploy` only
     duplicated work and did not fix LoxBerry temp-file races after uninstall.

You can also call the CLI directly:

```bash
npm run lb:cli -- plugins list
npm run lb:cli -- plugins deploy --project .   # after npm run release:zip — same as npm run plugins:deploy
npm run plugins:uninstall
```

`npm run plugins:uninstall` calls `plugins uninstall --name abfallio`. The
**loxberry-client** CLI resolves a **folder name** to the **pid (md5)** via `plugins list`
when `--name` is not 32 hex characters — you do not need a separate script.

To uninstall manually: `npm run lb:cli -- plugins uninstall --name <md5-or-folder>`.

## Maximum end-to-end test (destructive, opt-in)

For a full release-candidate gate there is an additional Playwright suite at
`test-e2e/full-lifecycle.spec.ts` that exercises the plugin on a **real**
LoxBerry appliance:

1. Builds a fresh release ZIP.
2. Uninstalls any previous version of `abfallio` from the appliance.
3. Uploads + installs the freshly built ZIP via the `loxberry-client` CLI.
4. Drives the admin UI: searches a street, picks a house number if required,
   saves the location (auto-fetch runs from the same flow).
5. Asserts that data is fetched, at least one upcoming category is rendered, and
   the public Loxone flat-text (`loxone.php`) endpoint returns category lines
   (including `?format=list` and `?cat=…` for a single value).
6. Exercises the **Settings** tab (default fetch interval, fuzz save, MQTT
   enable/disable save), the **Log** tab, the authenticated **ajax** actions
   (`status`, `log`), the public `index.php?view=html` page, and a German
   admin URL smoke check. It does **not** replace the Mocha suite: `npm test`
   still runs parser, scheduling, and MQTT **unit** tests locally and in CI; E2E
   only makes sense on a real appliance.
7. Stops. The plugin is deliberately left installed so you can inspect it.

This is **destructive** (it uninstalls and reinstalls the plugin). It is kept
out of `npm test` and CI; both the npm launcher and the spec file refuse to
run unless you opt in twice:

```bash
npm run test:e2e:full:go
```

(equivalent: `npm run test:e2e:full -- --yes-i-am-developer`)

Required environment variables in `.env`:

- `LOXBERRY_BASE_URL`, `LOXBERRY_USERNAME`, `LOXBERRY_PASSWORD`
- `LOXBERRY_SECURE_PIN`
- `TEST_STREET_QUERY` (used to type into the street search box)
- `TEST_STREET_NAME` (optional, preferred match in the dropdown)

Optional tuning (set in the environment or `.env` when using `dotenv-cli`):

- `E2E_HEADED=0` — run Chromium **headless** (default on your machine is a
  **visible** browser window so you can see the steps). Set `E2E_HEADED=0` in
  `.env` if you do not want a window. CI is always headless.
- `E2E_SKIP_UNINSTALL=1` — skip the uninstall step (useful to avoid
  back-to-back install races; you already get a *fresh* config only after a
  full uninstall+install of `abfallio`).
- The underlying LoxBerry API uses **`pid` = plugin MD5** (same as the web UI);
  the test harness passes that value, **not** the folder name, to
  `plugins uninstall --name …`.
- Uninstall is **verified** by re-querying `loxberry-client plugins list` until
  `abfallio` is gone (not only the CLI exit code). Tune with:
  `E2E_UNINSTALL_CMD_ATTEMPTS` (default `3`), `E2E_UNINSTALL_WAIT_MS` (default
  `120000` per attempt), `E2E_UNINSTALL_POLL_MS` (default `750` — how often
  `plugins list` is re-checked; the first check is immediate, then the delay).
- `E2E_POST_UNINSTALL_MS` (default `8000`) / `E2E_POST_INSTALL_MS` (default
  `12000`) — **extra** settle time in milliseconds *after* uninstall is
  confirmed in the list (or *after* the plugin row appears on install), so
  LoxBerry can finish internal work before the next step. On very slow
  hardware, raise them (e.g. `E2E_POST_UNINSTALL_MS=45000` was used earlier).
- `E2E_DEPLOY_MAX_ATTEMPTS` (default `6`) / `E2E_DEPLOY_RETRY_MS` (default `8000`) —
  after uninstall, `plugins deploy` is retried when the install log shows a
  missing temp zip or extract failure (known LoxBerry race); wait `E2E_DEPLOY_RETRY_MS`
  between attempts.
- `E2E_INSTALL_WAIT_MS` (default `120000`) / `E2E_INSTALL_POLL_MS` (default
  `750`) — how long the suite **polls `plugins list`** after a successful
  upload until the `abfallio` row appears (LoxBerry can be slower than the
  CLI exit code; first `plugins list` call is immediate, then the poll interval).

The first run downloads Playwright's Chromium build (~120 MB) into your local
Playwright cache.

## Runtime compatibility

- Requires Node.js ≥ 18 (LoxBerry 3 baseline).
- `preinstall.sh` performs a Node runtime version check.
- The release ZIP excludes dev-only folders so the appliance footprint stays small.

## GitHub Actions: secrets and tokens

- **CI (`.github/workflows/ci.yml`)** — needs **no** repository or organization secrets. It only typechecks, runs Mocha, and smoke-builds the plugin ZIP. It does not talk to a LoxBerry, upload plugins, or run Playwright E2E.
- **Release (`.github/workflows/release.yml`)** — uses the built-in **`GITHUB_TOKEN`**. You do **not** need a Personal Access Token (PAT) for creating releases and uploading the plugin ZIP, as long as the workflow job has `permissions: contents: write` (already set). No `NPM_TOKEN` is used; this project is not published to npm.
- If you add private Git submodules or a private `npm` registry later, you would add separate secrets then — the stock setup does not require them.

## Install from a GitHub Release URL (LoxBerry Plugin Management)

LoxBerry can install a plugin from a direct download URL. Use the **asset file** on a release, not the `Source code (zip)` download.

- Open the [GitHub releases page](https://github.com/spid3r/loxberry-api-abfall-io/releases) and pick a version, or use **Latest** for the current release.
- The attachable file is named like `loxberry-plugin-abfallio-1.2.3.zip` (exact name is shown on the release).
- A stable per-release URL has the form:

  `https://github.com/OWNER/REPO/releases/download/vVERSION/loxberry-plugin-abfallio-VERSION.zip`

  Example (replace with your real tag and file name as shown on the release):

  `https://github.com/spid3r/loxberry-api-abfall-io/releases/download/v1.0.0/loxberry-plugin-abfallio-1.0.0.zip`

Paste that URL into **LoxBerry Admin → Plugin Management** where the appliance asks for a plugin URL. The browser’s “Copy link” on the release asset is usually the right link (must return the raw ZIP, not an HTML page).

**Legacy `abfallu` install:** if you still have the old `abfallu` plugin folder, uninstall it before installing `abfallio` so you do not run two copies of the same app.

## LoxBerry email: “Unknown Plugin: Error while extracting from plugin archive” (or *“The PID does not exist”*)

That notification comes from the appliance when a **particular** install attempt fails. It is **not** always the final outcome if you immediately tried again. Common cases:

- **“Browse” / file upload in Plugin Management:** the [LoxBerry FAQ for this exact error](https://wiki.loxberry.de/loxberry_english/english_faq_and_knowledge_base/plugin_cannot_be_installed) explains that using the **file picker** can send a **corrupted stream** to the box, so unzip fails. **Prefer “install from URL”** (paste the [GitHub release asset](#install-from-a-github-release-url-loxberry-plugin-management) link so LoxBerry downloads the ZIP itself) or try another browser; the same `loxberry-plugin-abfallio-….zip` file often works when the appliance fetches it by URL.
- **Only one install at a time:** if an upload/URL install started while a previous one was still extracting, LoxBerry can report errors and email you even though a later attempt succeeds. Wait until Plugin Management is idle, then install once.
- **“Unknown Plugin: The PID does not exist”** often means the installer referred to a plugin process ID that LoxBerry had already cleared (race between uninstall/reinstall/parallel steps). The same mitigations as below apply: increase settle time between uninstall and install, avoid parallel installs, or set `E2E_SKIP_UNINSTALL=1` while iterating and upgrade manually once the box is quiet.
- **Automated or repeated tests:** the destructive E2E test or `plugins:upload:latest` in a loop can trigger overlapping or back-to-back installs. The suite now **polls the plugin list** after `plugins uninstall` so a slow UI does not look like a success; you can still raise `E2E_UNINSTALL_WAIT_MS` / `E2E_POST_UNINSTALL_MS` on a slow host, or use `E2E_SKIP_UNINSTALL=1` for in-place upgrade tests.
- **Wrong URL:** installing from a GitHub **HTML** page or a `Source code` zip instead of the **release asset** can fail; use the `releases/download/.../loxberry-plugin-....zip` link from the [Releases](https://github.com/spid3r/loxberry-api-abfall-io/releases) page.
- **Two plugins (`abfallu` + `abfallio`):** remove the legacy one to avoid confusion; only `abfallio` is the current package name in `plugin.cfg`.

If the latest install in the UI shows the plugin as installed and the admin UI works, the zip content is valid — treat the email as a failed attempt, not necessarily a broken build.

## Release workflow

This repository uses [semantic-release](https://github.com/semantic-release/semantic-release):

- Conventional Commits (`feat:`, `fix:`, `chore:`, …) drive the next version. The package starts at **0.0.0**; the **first** release is **v1.0.0** if you use a **breaking** commit header, e.g. `feat!: short description` (see `commitlint.config.mjs`). A non-breaking `feat:` from 0.0.0 would become **0.1.0** with the default analyzer.
- [Commitlint](https://github.com/conventional-changelog/commitlint) + a Husky `commit-msg` hook enforce messages locally. CI also runs commitlint; `HUSKY=0` is set during `npm ci` so hooks are not required in GitHub Actions.
- Pushes to `main` run `.github/workflows/release.yml`, which (via semantic-release) may:
  - bump `package.json` and `plugin.cfg`
  - regenerate `CHANGELOG.md`
  - create a Git tag and a **GitHub Release** with the **plugin ZIP** attached (`dist/loxberry-plugin-abfallio-*.zip`)
- It does **not** publish to npm.

[Dependabot](.github/dependabot.yml) can suggest updates for GitHub Actions and npm packages; merge those PRs to stay current.

### First time you push to GitHub

1. **Enable Actions** in the repository settings (if GitHub does not run workflows yet).
2. **CI** — every push/PR runs tests and a release-ZIP build; no secrets are required. Do not commit `.env` or LoxBerry credentials (they are gitignored).
3. **Releases** — merge to `default` / `main` with [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `perf:`) so `semantic-release` can compute a version, create a **Git tag** and a **GitHub Release**, and upload the `loxberry-plugin-abfallio-*.zip` asset. The workflow uses the built-in `GITHUB_TOKEN` only; no personal access token and no npm publish.
4. The **install URL** for LoxBerry “install from URL” is the *asset* link on the release, e.g. `https://github.com/ORG/REPO/releases/download/vX.Y.Z/loxberry-plugin-abfallio-X.Y.Z.zip` — not the “Source code” zip.
5. **Plugin list icon** — after a fix that adds `ICON=icon_64.png` and proper `icons/`, **reinstall or update the plugin** on the LoxBerry so the core can copy the new `icons/icon_*.png` set into `/system/images/icons/abfallio/`.

Local preview:

```bash
npm install
npm run release:dry-run
```

## Best-practice alignment

- LoxBerry-native plugin layout: `plugin.cfg`, `webfrontend/`, `config/`,
  `data/`, `cron/`, install hooks (`preinstall.sh` / `postinstall.sh` /
  `postroot.sh` / `preuninstall.sh` / `postuninstall.sh`).
- No mandatory Express Server plugin dependency.
- Live automation lives in root scripts and is excluded from the release ZIP.
- Follows LoxBerry developer guidance:
  - [LoxBerry Developer Overview](https://wiki.loxberry.de/entwickler/start)
  - [Node.js plugin development](https://wiki.loxberry.de/entwickler/node_js_plugin_entwicklung)

## License

MIT — see [LICENSE](LICENSE).

