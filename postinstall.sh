#!/bin/bash

ARGV0=$0
ARGV1=$1 # temp file (LoxBerry $1)
ARGV2=$2 # PLUGIN.NAME / $pname
ARGV3=$3 # PLUGIN.FOLDER / $pfolder (install dir under bin/plugins, data/plugins, …)
PFOLDER="${ARGV3:-$ARGV2}"

echo "<INFO> Setting permissions for scripts..."
chmod +x "$LBHOMEDIR/bin/plugins/$PFOLDER/fetch.cjs" 2>/dev/null
chmod +x "$LBHOMEDIR/bin/plugins/$PFOLDER/abfall_api.cjs" 2>/dev/null
chmod +x "$LBHOMEDIR/bin/plugins/$PFOLDER/patch_cron_loxberry.sh" 2>/dev/null || true

# REPLACELB* cron fix runs in postroot.sh (root); postinstall runs as user loxberry
# and cannot overwrite root-owned files in system/cron/cron.d/.

echo "<INFO> Creating symlink for public data endpoint..."
DATADIR=$LBHOMEDIR/data/plugins/$PFOLDER
HTMLDIR=$LBHOMEDIR/webfrontend/html/plugins/$PFOLDER
if [ ! -f "$DATADIR/abfall_data.json" ]; then
    echo '{}' > "$DATADIR/abfall_data.json"
fi
ln -sf "$DATADIR/abfall_data.json" "$HTMLDIR/abfall_data.json" 2>/dev/null || true

# LoxBerry can leave stale files under webfrontend/html/plugins/<name>/; copy
# public HTTP endpoints from the install extract (postinstall $1) every time.
if [ -n "$ARGV1" ] && [ -d "$ARGV1" ]; then
  PUBDIR="$ARGV1/webfrontend/html"
  if [ -d "$PUBDIR" ] && [ -d "$HTMLDIR" ]; then
    for f in index.php loxone.php waste_data_paths.php; do
      if [ -f "$PUBDIR/$f" ]; then
        if cp -f "$PUBDIR/$f" "$HTMLDIR/$f" 2>/dev/null; then
          echo "<INFO> Public endpoint refreshed: $f"
        fi
        chmod 644 "$HTMLDIR/$f" 2>/dev/null || true
      fi
    done
  fi
else
  echo "<WARN> postinstall: no temp extract dir; skipped public file refresh."
fi

echo "<OK> Installation completed successfully."
exit 0
