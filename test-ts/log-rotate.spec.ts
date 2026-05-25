import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MAX_LOG_BYTES,
  rotateLogFileIfNeeded,
} from "../src-ts/lib/log-rotate.js";

describe("log rotation", () => {
  it("does nothing when file is under limit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lblog-"));
    const file = path.join(dir, "abfall.log");
    fs.writeFileSync(file, "small\n", "utf-8");
    expect(rotateLogFileIfNeeded(file, 1024, 512)).to.equal(false);
    expect(fs.readFileSync(file, "utf-8")).to.equal("small\n");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("truncates to newest tail when over limit", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lblog2-"));
    const file = path.join(dir, "abfall.log");
    const old = "OLD-LINE\n".repeat(500);
    const recent = "RECENT-LINE\n".repeat(200);
    fs.writeFileSync(file, old + recent, "utf-8");
    const max = 4096;
    const tail = 2048;
    expect(rotateLogFileIfNeeded(file, max, tail)).to.equal(true);
    const text = fs.readFileSync(file, "utf-8");
    expect(text).to.include("Log rotated");
    expect(text).to.include("RECENT-LINE");
    expect(text).to.not.include("OLD-LINE");
    expect(fs.statSync(file).size).to.be.lessThan(max);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("uses sensible defaults (~512 KiB)", () => {
    expect(DEFAULT_MAX_LOG_BYTES).to.equal(512 * 1024);
  });
});
