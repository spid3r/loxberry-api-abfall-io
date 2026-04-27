import { expect } from "chai";
import { decodeShellQueryArg, encodeShellQueryArg } from "../src-ts/lib/shell-query-arg.js";

describe("shell-query-arg (UTF-8 through argv)", () => {
  it("round-trips umlauts and mixed case", () => {
    for (const s of ["würz", "Würzburg", "München straße", ""]) {
      expect(decodeShellQueryArg(encodeShellQueryArg(s))).to.equal(s);
    }
  });

  it("leaves non-b64 args unchanged (manual CLI)", () => {
    expect(decodeShellQueryArg("plain")).to.equal("plain");
  });
});
