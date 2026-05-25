/** Branches that may publish `{stable}-beta.N` pre-releases (see beta-release.yml). */
export function isBetaReleaseBranchRef(ref) {
  if (ref === "refs/heads/beta") return true;
  return /^refs\/heads\/(fix|feature|hotfix)\//.test(ref);
}

export function releaseBranchName(ref) {
  const m = /^refs\/heads\/(.+)$/.exec(ref ?? "");
  return m?.[1] ?? "beta";
}
