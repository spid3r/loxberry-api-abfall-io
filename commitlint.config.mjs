/**
 * Conventional commits — required for semantic-release.
 *
 * First public release from 0.0.0 → 1.0.0: use a BREAKING header, e.g.
 *   feat!: short description
 * (the "!" marks a breaking change; from 0.0.0 that becomes v1.0.0).
 */
export default {
  extends: ["@commitlint/config-conventional"],
};
