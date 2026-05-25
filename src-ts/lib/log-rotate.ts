import fs from "node:fs";

/** Default ~512 KiB; keep newest half after rotation. */
export const DEFAULT_MAX_LOG_BYTES = 512 * 1024;

export const DEFAULT_LOG_TAIL_BYTES = DEFAULT_MAX_LOG_BYTES / 2;

/**
 * If log file exceeds maxBytes, truncate to the newest tailBytes (line-aligned when possible).
 * LoxBerry has no built-in plugin log rotation — fixed filename + append is recommended.
 */
export function rotateLogFileIfNeeded(
  logFile: string,
  maxBytes = DEFAULT_MAX_LOG_BYTES,
  tailBytes = DEFAULT_LOG_TAIL_BYTES,
): boolean {
  if (!fs.existsSync(logFile)) return false;
  const size = fs.statSync(logFile).size;
  if (size <= maxBytes) return false;

  const keep = Math.min(tailBytes, maxBytes);
  const fd = fs.openSync(logFile, "r");
  try {
    const start = Math.max(0, size - keep);
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf-8");
    const nl = text.indexOf("\n");
    if (nl > 0 && start > 0) {
      text = text.slice(nl + 1);
    }
    const header = `[INFO] Log rotated (file exceeded ${maxBytes} bytes; keeping newest ~${keep} bytes)\n`;
    fs.writeFileSync(logFile, header + text, "utf-8");
    return true;
  } finally {
    fs.closeSync(fd);
  }
}
