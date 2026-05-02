# Developer guide (build, test, release, appliance)

This file holds the **long-form** workflow that used to live entirely in the root [README](../README.md). End users can stay on the README; contributors read this.

## Local setup

```bash
git clone https://github.com/spid3r/loxberry-api-abfall-io.git
cd loxberry-api-abfall-io
npm install
npm run typecheck
npm test
npm run build
```

**Full local gate** (types, unit tests, release ZIP, zip sanity, Playwright spec load — **no** destructive appliance E2E unless opted in):

```bash
npm run test:all
```

**`loxberry-client-library` side-by-side** (sibling clone): after library changes, `npm run link:client-lib` rebuilds and `npm link`s the client. Run again after `git pull` or library edits.

**CLI smoke** (from repo root):

```bash
node bin/abfall_api.cjs status
node bin/abfall_api.cjs search_street "main"
node bin/abfall_api.cjs search_hnr "<street_id>"
node bin/abfall_api.cjs fetch
node bin/fetch.cjs --force
```

## Building the release ZIP

```bash
npm install
npm run release:zip
```

Runs `build:icons`, `build` (esbuild → `bin/dist-node/`), then `scripts/build-release.mjs`. Artifact: `dist/loxberry-plugin-abfallio-<version>.zip`. The ZIP omits dev trees, `node_modules`, and **`config/abfall.json`** (userdata lives under `$LBHOMEDIR/config/plugins/<folder>/`; **`preupgrade.sh` / `postupgrade.sh`** back up and restore `config/` and `data/` on LoxBerry upgrades).

## Wiki screenshots (optional)

Against a real configured appliance (`.env` with `LOXBERRY_BASE_URL`, credentials):

```bash
npm run wiki:screenshots
npm run wiki:screenshots:watch   # headed + watch
```

Then `npm run wiki:build` regenerates `docs/WIKI_DOKUWIKI_START.txt`.

## Live appliance: `loxberry-client`

Uses [`loxberry-client-library`](https://github.com/spid3r/loxberry-client-library) (`file:../loxberry-client-library` when cloned as a sibling). `npm run plugins:deploy` runs `loxberry-client plugins deploy --project .` (newest `dist/loxberry-plugin-*.zip`, `FOLDER` from `plugin.cfg`, `--wait-install`, md5 fallback).

1. `npm run release:zip`
2. Copy `.env.example` → `.env` (appliance URL, user, password, SecurePIN — **never commit**).
3. Examples: `npm run plugins:list`, `npm run test:live`, `npm run plugins:deploy`, `npm run test:live:street`, `npm run test:live:full`, `npm run e2e:appliance:go`.

Direct CLI:

```bash
npm run lb:cli -- plugins list
npm run lb:cli -- plugins deploy --project .
npm run plugins:uninstall
```

`plugins uninstall --name abfallio` resolves folder name to plugin id via `plugins list`.

## Destructive E2E (opt-in)

Suite: `test-e2e/full-lifecycle.spec.ts`. Uninstalls, deploys fresh ZIP, drives UI, checks `loxone.php` / settings / log / ajax. **Not** in default `npm test` or CI.

```bash
npm run test:e2e:full:go
# or: npm run test:e2e:full -- --yes-i-am-developer
```

Required `.env`: `LOXBERRY_BASE_URL`, `LOXBERRY_USERNAME`, `LOXBERRY_PASSWORD`, `LOXBERRY_SECURE_PIN`, `TEST_STREET_QUERY`, optional `TEST_STREET_NAME`.

Tuning (documented in the spec / README previously): `E2E_HEADED`, `E2E_SKIP_UNINSTALL`, `E2E_UNINSTALL_*`, `E2E_POST_*`, `E2E_DEPLOY_*`, `E2E_INSTALL_*`. First run downloads Playwright Chromium (~120 MB).

## GitHub Actions: secrets

- **CI** ([`ci.yml`](../.github/workflows/ci.yml)) — no repo secrets; typecheck, Mocha, ZIP build, wiki generate/validate, Playwright load (no live E2E).
- **Release** ([`release.yml`](../.github/workflows/release.yml)) — `GITHUB_TOKEN` with `contents: write`; no PAT or npm publish for this repo.

## Install from a release URL (LoxBerry)

Use the **asset** link on a [GitHub Release](https://github.com/spid3r/loxberry-api-abfall-io/releases), not “Source code (zip)”:

`https://github.com/spid3r/loxberry-api-abfall-io/releases/download/vVERSION/loxberry-plugin-abfallio-VERSION.zip`

Paste into LoxBerry Plugin Management “install from URL”. “Copy link” on the asset should return the raw ZIP.

## Release workflow (semantic-release + beta)

- **Conventional Commits** drive versions ([`commitlint.config.mjs`](../commitlint.config.mjs)).
- Push to **`main`** → [`.github/workflows/release.yml`](../.github/workflows/release.yml): semantic-release may bump `package.json` / `plugin.cfg`, update `CHANGELOG.md`, tag, GitHub Release + ZIP, **`release.cfg`** on `main`.
- Push to **`beta`** → [`.github/workflows/beta-release.yml`](../.github/workflows/beta-release.yml): [`scripts/beta-release.mjs`](../scripts/beta-release.mjs) builds **`{latest stable tag}-beta.N`**, updates **`prerelease.cfg`**, pre-release on GitHub, bot `chore(release): … [skip ci]` commit. This is a **build counter on the current stable line**, not semantic-release’s default prerelease-of-next-version model.
- Merge **`beta` → `main`** when shipping stable; semantic-release then does real semver + changelog.

**SemVer on the appliance:** stable `1.4.1` is **newer** than `1.4.1-beta.*`; “Pre- and Releases” alone does not downgrade stable to beta. Install a beta ZIP once to be on the beta line, then autoupdate can offer `beta.N+1`. See README “Pre-Releases” summary.

Dry-run locally:

```bash
npm run release:dry-run
BETA_RELEASE_DRY_RUN=1 npm run release:beta
```

## Architecture (code layout)

- **Backend:** TypeScript, esbuild → `dist-node/cli/`, mirrored to `bin/dist-node/`; `bin/*.cjs` shims.
- **Frontend:** LoxBerry PHP (`webfrontend/htmlauth/…`, `ajax.php`).
- **i18n:** `i18n.php`, `templates/lang/language_*.ini`; public help `webfrontend/html/index.php` + static HTML.
- **Tests:** Mocha in `test-ts/`; Playwright in `test-e2e/` (destructive suite opt-in).

Repo tree (abbreviated): `src-ts/`, `test-ts/`, `test-e2e/`, `webfrontend/`, `templates/`, `config/` (dev default `abfall.json` **not** in release ZIP), `bin/`, `scripts/`, `.github/`.

## Install troubleshooting

See [troubleshooting-plugin-install.md](./troubleshooting-plugin-install.md).
