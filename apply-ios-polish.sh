#!/usr/bin/env bash
# Applies the NJUGA/CASINO iPhone settings to the Capacitor-generated ios/ project.
# Run after `npx cap add ios` (setup-ios.sh does both). macOS only for building,
# but this script itself only edits files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---- edit these if needed -------------------------------------------------
MIN_IOS="17.0"            # lowest iOS version the app installs on (built with the iOS 27 SDK)
VERSION="1.0.0"           # CFBundleShortVersionString / MARKETING_VERSION
BUILD="1"                 # CFBundleVersion / CURRENT_PROJECT_VERSION
# ---------------------------------------------------------------------------

IOS="$ROOT/ios/App"
APP="$IOS/App"
if [ ! -d "$APP" ]; then
  echo "ios/ does not exist. Run: npx cap add ios"; exit 1
fi

# 1. Icon, splash, privacy manifest
cp -R "$ROOT/native/ios-overrides/AppIcon.appiconset/." "$APP/Assets.xcassets/AppIcon.appiconset/"
mkdir -p "$APP/Assets.xcassets/Splash.imageset"
cp -R "$ROOT/native/ios-overrides/Splash.imageset/." "$APP/Assets.xcassets/Splash.imageset/"
cp "$ROOT/native/ios-overrides/PrivacyInfo.xcprivacy" "$APP/PrivacyInfo.xcprivacy"
if [ -f "$IOS/App.xcodeproj/project.pbxproj" ] && ! grep -q "PrivacyInfo.xcprivacy" "$IOS/App.xcodeproj/project.pbxproj"; then
  echo "NOTE: PrivacyInfo.xcprivacy is not in the Xcode target yet. In Xcode: drag ios/App/App/PrivacyInfo.xcprivacy"
  echo "      into the App group and tick the 'App' target."
fi

# 2. Info.plist: iPhone portrait, light status bar, export-compliance, display name
python3 - "$APP/Info.plist" "$VERSION" "$BUILD" <<'PY'
import plistlib, sys
path, version, build = sys.argv[1:4]
with open(path, 'rb') as f: pl = plistlib.load(f)
pl['CFBundleDisplayName'] = 'NJUGA/CASINO'
pl['UISupportedInterfaceOrientations'] = ['UIInterfaceOrientationPortrait']
pl.pop('UISupportedInterfaceOrientations~ipad', None)
pl['UIStatusBarStyle'] = 'UIStatusBarStyleLightContent'
pl['UIViewControllerBasedStatusBarAppearance'] = True
pl['ITSAppUsesNonExemptEncryption'] = False   # only standard HTTPS/WSS, no custom crypto
pl['UIRequiredDeviceCapabilities'] = ['arm64']
pl['LSRequiresIPhoneOS'] = True
with open(path, 'wb') as f: plistlib.dump(pl, f)
print("Info.plist updated")
PY

# 3. Xcode project: iPhone only, minimum iOS, version numbers
PBX="$IOS/App.xcodeproj/project.pbxproj"
if [ -f "$PBX" ]; then
  sed -i.bak -E \
    -e "s/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/IPHONEOS_DEPLOYMENT_TARGET = $MIN_IOS;/" \
    -e 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/' \
    -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $VERSION;/" \
    -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $BUILD;/" \
    "$PBX" && rm -f "$PBX.bak"
fi
# Swift Package Manager manifest (Capacitor 8 default)
MAJOR="${MIN_IOS%%.*}"
for PKG in "$IOS"/CapApp-SPM/Package.swift; do
  [ -f "$PKG" ] && sed -i.bak -E "s/\.iOS\(\.v[0-9]+\)/.iOS(.v$MAJOR)/" "$PKG" && rm -f "$PKG.bak"
done
[ -f "$IOS/Podfile" ] && sed -i.bak -E "s/platform :ios, '[0-9.]+'/platform :ios, '$MIN_IOS'/" "$IOS/Podfile" && rm -f "$IOS/Podfile.bak"

echo "iOS polish applied (min iOS $MIN_IOS, iPhone only, portrait)."
