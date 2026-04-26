#!/bin/bash

ARGV0=$0
ARGV1=$1 # tempfolder
ARGV2=$2 # pluginname

echo "<INFO> Removing cron job..."
CRONFILE="$LBHOMEDIR/system/cron/cron.d/loxberry-plugin-$ARGV2"
rm -f "$CRONFILE" 2>/dev/null

echo "<INFO> Removing symlink..."
HTMLDIR=$LBHOMEDIR/webfrontend/html/plugins/$ARGV2
rm -f "$HTMLDIR/abfall_data.json" 2>/dev/null

echo "<OK> Uninstall cleanup completed."
exit 0
