#!/bin/bash
# Backup userdata before LoxBerry replaces plugin directories (wiki: Grundlagen, Step 6/7).
# Args: see postinstall/postupgrade — $1 staging id, $3 plugin folder (FOLDER), $5 LBHOMEDIR

ARGV1="$1"
ARGV3="$3"
ARGV5="$5"
if [ -z "$ARGV1" ] || [ -z "$ARGV3" ] || [ -z "$ARGV5" ]; then
  echo "<WARN> preupgrade: missing args; skipping backup"
  exit 0
fi

STASH="/tmp/${ARGV1}_abfallio_upgrade"
rm -rf "$STASH"
mkdir -p "$STASH"

for rel in config data; do
  SRC="${ARGV5}/${rel}/plugins/${ARGV3}"
  if [ -d "$SRC" ]; then
    mkdir -p "${STASH}/${rel}"
    if cp -a "$SRC" "${STASH}/${rel}/" 2>/dev/null; then
      echo "<INFO> preupgrade: backed up ${rel}/plugins/${ARGV3}"
    else
      echo "<WARN> preupgrade: backup failed for ${rel}/plugins/${ARGV3}"
    fi
  fi
done

exit 0
