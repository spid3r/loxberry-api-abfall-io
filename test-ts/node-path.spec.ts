import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
  LOXBERRY_NODE_CANDIDATE_PATHS,
  resolveNodePath,
} from "../src-ts/lib/node-path.js";

describe("node-path resolution", () => {
  it("prefers the first executable candidate in order", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lbnode-"));
    const first = path.join(dir, "node-a");
  const second = path.join(dir, "node-b");
    fs.writeFileSync(first, "#!/bin/sh\necho a\n", { mode: 0o755 });
    fs.writeFileSync(second, "#!/bin/sh\necho b\n", { mode: 0o755 });
    try {
      expect(resolveNodePath([first, second])).to.equal(first);
      expect(resolveNodePath([second, first])).to.equal(second);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null when no candidate is executable", () => {
    expect(resolveNodePath(["/nonexistent/node/for-test"])).to.equal(null);
  });

  it("lists LoxBerry-opt path before /usr/bin/node", () => {
    expect(LOXBERRY_NODE_CANDIDATE_PATHS[0]).to.equal("/opt/loxberry/bin/node");
    expect(LOXBERRY_NODE_CANDIDATE_PATHS).to.include("/usr/bin/node");
  });
});
