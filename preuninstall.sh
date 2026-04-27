#!/bin/bash

ARGV0=$0
ARGV1=$1
ARGV2=$2 # pname (PLUGIN.NAME) — cron.d filename
ARGV3=$3 # pfolder — web/html/plugin subdir
PFOLDER="${ARGV3:-$ARGV2}"

echo "<INFO> Removing cron job..."
CRONFILE="$LBHOMEDIR/system/cron/cron.d/$ARGV2"
rm -f "$CRONFILE" 2>/dev/null

echo "<INFO> Removing symlink..."
HTMLDIR=$LBHOMEDIR/webfrontend/html/plugins/$PFOLDER
rm -f "$HTMLDIR/abfall_data.json" 2>/dev/null

echo "<OK> Uninstall cleanup completed."
exit 0
