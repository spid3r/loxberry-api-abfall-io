#!/bin/bash
# Restore userdata after upgrade (paired with preupgrade.sh).

ARGV1="$1"
ARGV3="$3"
ARGV5="$5"
if [ -z "$ARGV1" ] || [ -z "$ARGV3" ] || [ -z "$ARGV5" ]; then
  exit 0
fi

STASH="/tmp/${ARGV1}_abfallio_upgrade"

restore_kind() {
  local rel="$1"
  local src="${STASH}/${rel}/${ARGV3}"
  local dest="${ARGV5}/${rel}/plugins/${ARGV3}"
  if [ -d "$src" ]; then
    mkdir -p "$dest"
    if cp -a "${src}/." "${dest}/" 2>/dev/null; then
      echo "<INFO> postupgrade: restored ${rel}/plugins/${ARGV3}"
    else
      echo "<WARN> postupgrade: restore failed for ${rel}/plugins/${ARGV3}"
    fi
  fi
}

if [ -d "$STASH" ]; then
  restore_kind config
  restore_kind data
  rm -rf "$STASH"
fi

exit 0
