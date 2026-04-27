/**
 * When PHP (or a shell) runs `node abfall_api.cjs …` with `escapeshellarg`, UTF-8
 * and Umlauts are often broken. The caller passes the payload as `b64:` + base64(UTF-8);
 * the argv string stays ASCII.
 */
export function decodeShellQueryArg(s: string): string {
  if (s.startsWith("b64:")) {
    return Buffer.from(s.slice(4), "base64").toString("utf8");
  }
  return s;
}

export function encodeShellQueryArg(s: string): string {
  return `b64:${Buffer.from(s, "utf8").toString("base64")}`;
}
