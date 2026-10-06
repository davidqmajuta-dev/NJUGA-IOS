#!/usr/bin/env bash
# One-shot iOS setup. Needs a Mac with Xcode (the iOS 27 SDK) and Node.js.
set -euo pipefail
cd "$(dirname "$0")"
if [ "$(uname)" != "Darwin" ]; then
  echo "iOS apps can only be built on macOS with Xcode. See BUILD-IOS.md for the no-Mac (cloud build) route."; exit 1
fi
command -v node >/dev/null || { echo "Install Node.js first."; exit 1; }
command -v xcodebuild >/dev/null || { echo "Install Xcode from the App Store first."; exit 1; }
npm install
[ -d ios ] || npx cap add ios
npx cap sync ios
bash ./apply-ios-polish.sh
npx cap sync ios
npx cap open ios
