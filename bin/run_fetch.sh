#!/bin/bash
# Cron-safe wrapper: resolves Node at runtime, then runs fetch.cjs.
# LoxBerry cron uses a minimal PATH — do not invoke /usr/bin/node directly here.

set -u

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

# shellcheck source=bin/find_node.sh
. "$SCRIPT_DIR/find_node.sh"

: "${LBHOMEDIR:?LBHOMEDIR is not set}"
: "${LBPPLUGINDIR:?LBPPLUGINDIR is not set}"

NODE_BIN="$(find_loxberry_node)" || {
  echo "[ERROR] Node.js not found for scheduled fetch (tried /opt/loxberry/bin/node, /usr/bin/node, /usr/local/bin/node, PATH)" >&2
  exit 127
}

export LBHOMEDIR LBPPLUGINDIR
exec "$NODE_BIN" "$SCRIPT_DIR/fetch.cjs"
