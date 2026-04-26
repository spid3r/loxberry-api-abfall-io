#!/bin/bash

set -e

if ! command -v node >/dev/null 2>&1; then
    echo "<ERROR> Node.js is required but not installed."
    echo "<ERROR> This plugin requires LoxBerry 3 with Node.js 18.x or newer."
    exit 1
fi

NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
    echo "<ERROR> Detected Node.js version: $(node -v)"
    echo "<ERROR> Required: Node.js 18.x or newer."
    exit 1
fi

echo "<INFO> Node.js runtime check passed: $(node -v)"
exit 0
