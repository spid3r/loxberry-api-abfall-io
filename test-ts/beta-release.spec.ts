import { expect } from "chai";
import { isBetaReleaseBranchRef } from "../src-ts/lib/beta-release-branches.js";

describe("beta-release branch policy", () => {
  it("allows beta and conventional topic branch prefixes", () => {
    expect(isBetaReleaseBranchRef("refs/heads/beta")).to.equal(true);
    expect(isBetaReleaseBranchRef("refs/heads/fix/cron-node-path")).to.equal(true);
    expect(isBetaReleaseBranchRef("refs/heads/feature/mqtt-ui")).to.equal(true);
    expect(isBetaReleaseBranchRef("refs/heads/hotfix/urgent")).to.equal(true);
  });

  it("rejects main and unrelated branch names", () => {
    expect(isBetaReleaseBranchRef("refs/heads/main")).to.equal(false);
    expect(isBetaReleaseBranchRef("refs/heads/chore/deps")).to.equal(false);
    expect(isBetaReleaseBranchRef("refs/heads/dependabot/npm_and_yarn/foo")).to.equal(false);
  });
});
