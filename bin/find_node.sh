#!/bin/bash
# Resolve Node.js on LoxBerry (cron has minimal PATH).
# Keep candidate order in sync with src-ts/lib/node-path.ts and ajax.php.

find_loxberry_node() {
  local candidate
  if [ -n "${LOXBERRY_NODE:-}" ] && [ -x "${LOXBERRY_NODE}" ]; then
    echo "${LOXBERRY_NODE}"
    return 0
  fi
  for candidate in \
    "/opt/loxberry/bin/node" \
    "/usr/bin/node" \
    "/usr/local/bin/node"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  candidate="$(command -v node 2>/dev/null || true)"
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    echo "$candidate"
    return 0
  fi
  return 1
}
