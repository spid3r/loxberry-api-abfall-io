#!/bin/bash
# Sourced from postroot.sh (root). Requires: LBHOMEDIR, ARGV2 (PLUGIN.NAME = cron.d basename).
# Idempotent: expands REPLACELB* placeholders and migrates legacy /usr/bin/node fetch.cjs lines
# to the resilient run_fetch.sh wrapper (issue #12).
# Do not use "set -e" here: this file is sourced from postinstall/postupgrade.

: "${LBHOMEDIR?}"
: "${ARGV2?}"

# LBPPLUGINDIR token should match PLUGIN.FOLDER ($PFOLDER / $3), not necessarily PLUGIN.NAME ($2).
_PLUGDIR="${PFOLDER:-$ARGV2}"

CRONFILE="$LBHOMEDIR/system/cron/cron.d/$ARGV2"
if [ ! -f "$CRONFILE" ]; then
  return 0
fi

LOGDIR="$LBHOMEDIR/log/plugins/$_PLUGDIR"
WRAPPER="$LBHOMEDIR/bin/plugins/$_PLUGDIR/run_fetch.sh"
CANONICAL_LINE="17 * * * * loxberry LBHOMEDIR=$LBHOMEDIR LBPPLUGINDIR=$_PLUGDIR $WRAPPER >> $LOGDIR/abfall.log 2>&1"

_needs_patch() {
  if grep -q 'REPLACELB' "$CRONFILE" 2>/dev/null; then
    return 0
  fi
  if grep -qE '/[^[:space:]]+/node[[:space:]]+[^[:space:]]*fetch\.cjs' "$CRONFILE" 2>/dev/null; then
    return 0
  fi
  if grep -q 'fetch\.cjs' "$CRONFILE" 2>/dev/null && ! grep -q 'run_fetch\.sh' "$CRONFILE" 2>/dev/null; then
    return 0
  fi
  return 1
}

if ! _needs_patch; then
  return 0
fi

echo "<WARN> Cron needs patch (REPLACELB* and/or legacy node path); rewriting to run_fetch.sh wrapper..."

TMPFILE="${CRONFILE}.tmp.$$"
{
  echo "# Waste Collection - check hourly; run_fetch.sh respects configured interval + fuzz."
  echo "# Patched by patch_cron_loxberry.sh on $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date '+%Y-%m-%d %H:%M:%S')"
  echo "$CANONICAL_LINE"
} > "$TMPFILE" 2>/dev/null || {
  rm -f "$TMPFILE"
  return 0
}

if [ ! -s "$TMPFILE" ]; then
  rm -f "$TMPFILE"
  return 0
fi

mv -f "$TMPFILE" "$CRONFILE" 2>/dev/null || rm -f "$TMPFILE"
echo "<INFO> Cron patch applied: $CRONFILE"
