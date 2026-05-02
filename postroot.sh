#!/bin/bash
# Runs as root after postinstall/postupgrade. Patches merged cron if LoxBerry left
# REPLACELB* placeholders (postinstall cannot: cron.d files are root-owned).
# LoxBerry: $2=pname (cron.d filename = PLUGIN.NAME), $3=pfolder, $5=lbhomedir
ARGV0=$0
ARGV1=$1
ARGV2=$2
ARGV3=$3
ARGV4=$4
LBHOMEDIR="${5:-}"
export LBHOMEDIR
export ARGV2

PFOLDER="${ARGV3:-$ARGV2}"
export PFOLDER
PATCHCRON="$LBHOMEDIR/bin/plugins/$PFOLDER/patch_cron_loxberry.sh"
chmod +x "$PATCHCRON" 2>/dev/null || true
if [ -f "$PATCHCRON" ]; then
  # shellcheck source=bin/patch_cron_loxberry.sh
  . "$PATCHCRON" || true
fi

echo "<OK> postroot completed."
exit 0
