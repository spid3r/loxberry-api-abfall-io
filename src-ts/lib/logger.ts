import fs from "node:fs";
import { resolvePaths } from "./paths.js";

type Level = "INFO" | "WARNING" | "ERROR" | "DEBUG";

function now(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level: Level, message: string, toStderr = true): void {
  const { logFile, logDir } = resolvePaths();
  fs.mkdirSync(logDir, { recursive: true });
  const line = `${now()} [${level}] ${message}\n`;
  fs.appendFileSync(logFile, line, { encoding: "utf-8" });
  if (toStderr) {
    process.stderr.write(line);
  }
}

export const log = {
  info(message: string): void {
    write("INFO", message);
  },
  warn(message: string): void {
    write("WARNING", message);
  },
  error(message: string): void {
    write("ERROR", message);
  },
  debug(message: string): void {
    write("DEBUG", message, false);
  },
};
