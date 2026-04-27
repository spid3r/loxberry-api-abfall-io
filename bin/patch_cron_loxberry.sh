#!/bin/bash
# Sourced from postroot.sh (root). Requires: LBHOMEDIR, ARGV2 (PLUGIN.NAME = cron.d basename).
# Idempotent: only rewrites the merged cron if REPLACELB* tokens are still present.
# Do not use "set -e" here: this file is sourced from postinstall/postupgrade.

: "${LBHOMEDIR?}"
: "${ARGV2?}"

CRONFILE="$LBHOMEDIR/system/cron/cron.d/$ARGV2"
if [ ! -f "$CRONFILE" ]; then
  return 0
fi
if ! grep -q 'REPLACELB' "$CRONFILE" 2>/dev/null; then
  return 0
fi

echo "<WARN> Cron still contains REPLACELB* placeholders; patching paths..."
LOGDIR="$LBHOMEDIR/log/plugins/$ARGV2"
TMPFILE="${CRONFILE}.tmp.$$"
if ! sed -e "s|REPLACELBPHOMEDIR|$LBHOMEDIR|g" \
     -e "s|REPLACELBPPLUGINDIR|$ARGV2|g" \
     -e "s|REPLACELBPLOGDIR|$LOGDIR|g" \
     "$CRONFILE" > "$TMPFILE" 2>/dev/null; then
  rm -f "$TMPFILE"
  return 0
fi
if [ ! -s "$TMPFILE" ]; then
  rm -f "$TMPFILE"
  return 0
fi
mv -f "$TMPFILE" "$CRONFILE" 2>/dev/null || rm -f "$TMPFILE"
echo "<INFO> Cron placeholder patch applied: $CRONFILE"
