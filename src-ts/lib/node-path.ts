import fs from "node:fs";

/**
 * Candidate Node.js binary paths on LoxBerry appliances.
 * Keep in sync with `bin/find_node.sh` and `webfrontend/htmlauth/ajax.php`.
 *
 * LoxBerry 3 typically ships Node under `/opt/loxberry/bin/node`. Cron runs with a
 * minimal PATH, so callers must not rely on `PATH` alone. `/usr/bin/node` is listed
 * for older docs/images but is often missing — see issue #12.
 */
export const LOXBERRY_NODE_CANDIDATE_PATHS = [
  "/opt/loxberry/bin/node",
  "/usr/bin/node",
  "/usr/local/bin/node",
] as const;

/** Resolve the first existing, executable Node binary from {@link LOXBERRY_NODE_CANDIDATE_PATHS}. */
export function resolveNodePath(candidates: readonly string[] = LOXBERRY_NODE_CANDIDATE_PATHS): string | null {
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return null;
}
