#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ ! -d "$ROOT/android" ]; then
  echo "android/ does not exist. Run: npx cap add android"
  exit 1
fi
APP="$ROOT/android/app/src/main"
mkdir -p "$APP/res"
cp -R "$ROOT/native/android-overrides/res/"* "$APP/res/"

# Enforce the current Google Play target requirement for new apps.
if [ -f "$ROOT/android/variables.gradle" ]; then
  sed -i -E 's/(compileSdkVersion[[:space:]]*=)[[:space:]]*[0-9]+/\1 36/' "$ROOT/android/variables.gradle" || true
  sed -i -E 's/(targetSdkVersion[[:space:]]*=)[[:space:]]*[0-9]+/\1 36/' "$ROOT/android/variables.gradle" || true
fi

# Keep Play version metadata aligned with the app release.
GRADLE_APP="$ROOT/android/app/build.gradle"
if [ -f "$GRADLE_APP" ]; then
  sed -i -E 's/versionCode[[:space:]]+[0-9]+/versionCode 1/' "$GRADLE_APP" || true
  sed -i -E 's/versionName[[:space:]]+"[^"]+"/versionName "1.0.0"/' "$GRADLE_APP" || true
fi

# Copy the generated launcher PNGs into density folders: the legacy flattened
# icons, plus the adaptive-icon foreground/background layers (Android 8+).
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  mkdir -p "$APP/res/mipmap-$d"
  cp "$ROOT/native/android-overrides/res/mipmap-$d/ic_launcher.png" "$APP/res/mipmap-$d/ic_launcher.png"
  cp "$ROOT/native/android-overrides/res/mipmap-$d/ic_launcher_round.png" "$APP/res/mipmap-$d/ic_launcher_round.png"
  cp "$ROOT/native/android-overrides/res/mipmap-$d/ic_launcher_foreground.png" "$APP/res/mipmap-$d/ic_launcher_foreground.png"
  cp "$ROOT/native/android-overrides/res/mipmap-$d/ic_launcher_background.png" "$APP/res/mipmap-$d/ic_launcher_background.png"
done
mkdir -p "$APP/res/mipmap-anydpi-v26"
cp "$ROOT/native/android-overrides/res/mipmap-anydpi-v26/ic_launcher.xml" "$APP/res/mipmap-anydpi-v26/ic_launcher.xml"
cp "$ROOT/native/android-overrides/res/mipmap-anydpi-v26/ic_launcher_round.xml" "$APP/res/mipmap-anydpi-v26/ic_launcher_round.xml"

MANIFEST="$APP/AndroidManifest.xml"
if [ -f "$MANIFEST" ]; then
  python3 - "$MANIFEST" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
s=s.replace('<application ', '<application android:theme="@style/AppTheme" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" android:label="NJUGA/CASINO" ', 1) if '<application ' in s and 'android:theme="@style/AppTheme"' not in s else s
p.write_text(s)
PY
fi

echo "Android polish applied. Run ./gradlew.bat bundleRelease from android/ for the Play Store AAB."
