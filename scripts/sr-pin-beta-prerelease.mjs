import semver from "semver";
import { template } from "lodash-es";

/** Matches semantic-release default when nothing is tagged yet. */
const FIRST_STABLE_FALLBACK = "1.0.0";
/** Matches semantic-release `FIRSTPRERELEASE` (see semantic-release/constants). */
const FIRST_PRERELEASE_BUILD = "1";

function prereleaseIdentifier(branch) {
  return typeof branch.prerelease === "string" ? branch.prerelease : branch.name;
}

function gitTag(tagFormat, version) {
  return template(tagFormat)({ version });
}

function coreTriple(version) {
  const parsed = semver.parse(version);
  return parsed ? `${parsed.major}.${parsed.minor}.${parsed.patch}` : null;
}

/**
 * On branch `beta`, keep the semver *core* at the newest **stable** tag and only bump
 * `-beta.N`. Main still uses semantic-release's default bumps (feat/fix/minor/major).
 */
function computePinnedBetaVersion(branch, tagFormat) {
  const id = prereleaseIdentifier(branch);

  const allValid = [...new Set(branch.tags.map(({ version }) => version).filter((v) => semver.valid(v)))];

  const latestStable = allValid.filter((v) => !semver.prerelease(v)).sort(semver.rcompare)[0] ?? null;

  const baseCore = latestStable ?? FIRST_STABLE_FALLBACK;

  const betaOnBase = allValid.filter((v) => {
    if (!semver.prerelease(v)) return false;
    const pre = semver.prerelease(v);
    if (!pre || String(pre[0]) !== String(id)) return false;
    return coreTriple(v) === baseCore;
  });

  const lastMatching = betaOnBase.sort(semver.rcompare)[0];

  const version = lastMatching
    ? semver.inc(lastMatching, "prerelease", id)
    : `${baseCore}-${id}.${FIRST_PRERELEASE_BUILD}`;

  if (!semver.valid(version)) {
    throw new Error(`sr-pin-beta-prerelease: invalid computed version (${version}).`);
  }

  return { version, gitTag: gitTag(tagFormat, version) };
}

export async function verifyRelease(_pluginConfig, context) {
  const { branch, nextRelease, logger, options } = context;

  if (branch.type !== "prerelease") return;

  const pid = prereleaseIdentifier(branch);
  const pinned = computePinnedBetaVersion(branch, options.tagFormat);

  if (pinned.version !== nextRelease.version) {
    logger.warn(
      `[sr-pin-beta-prerelease] Overriding semantic-release version %s → %s (beta stays on latest stable core; only %s prerelease suffix increments until main publishes).`,
      nextRelease.version,
      pinned.version,
      pid,
    );
  } else {
    logger.log("[sr-pin-beta-prerelease] Version %s already matches pinned beta policy.", nextRelease.version);
  }

  Object.assign(nextRelease, {
    version: pinned.version,
    gitTag: pinned.gitTag,
    name: pinned.gitTag,
  });
}
