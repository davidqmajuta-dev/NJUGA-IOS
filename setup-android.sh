#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js, then rerun this script."
  exit 1
fi

npm install
npx cap add android
npx cap sync android
npx cap open android
