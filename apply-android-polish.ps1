$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Android = Join-Path $Root 'android'
if (!(Test-Path $Android)) { throw 'android/ does not exist. Run: npx cap add android' }
$App = Join-Path $Android 'app/src/main'
New-Item -ItemType Directory -Force -Path (Join-Path $App 'res') | Out-Null
Copy-Item (Join-Path $Root 'native/android-overrides/res/*') (Join-Path $App 'res') -Recurse -Force

$vars = Join-Path $Android 'variables.gradle'
if (Test-Path $vars) {
  $s = Get-Content $vars -Raw
  $s = $s -replace '(compileSdkVersion\s*=)\s*\d+', '$1 36'
  $s = $s -replace '(targetSdkVersion\s*=)\s*\d+', '$1 36'
  Set-Content $vars $s
}

$gradleApp = Join-Path $Android 'app/build.gradle'
if (Test-Path $gradleApp) {
  $s = Get-Content $gradleApp -Raw
  $s = $s -replace 'versionCode\s+\d+', 'versionCode 1'
  $s = $s -replace 'versionName\s+"[^"]+"', 'versionName "1.0.0"'
  Set-Content $gradleApp $s
}

foreach ($d in @('mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi')) {
  $dest = Join-Path $App "res/mipmap-$d"
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item (Join-Path $Root "native/android-overrides/res/mipmap-$d/ic_launcher.png") (Join-Path $dest 'ic_launcher.png') -Force
  Copy-Item (Join-Path $Root "native/android-overrides/res/mipmap-$d/ic_launcher_round.png") (Join-Path $dest 'ic_launcher_round.png') -Force
  Copy-Item (Join-Path $Root "native/android-overrides/res/mipmap-$d/ic_launcher_foreground.png") (Join-Path $dest 'ic_launcher_foreground.png') -Force
  Copy-Item (Join-Path $Root "native/android-overrides/res/mipmap-$d/ic_launcher_background.png") (Join-Path $dest 'ic_launcher_background.png') -Force
}
$anydpi = Join-Path $App 'res/mipmap-anydpi-v26'
New-Item -ItemType Directory -Force -Path $anydpi | Out-Null
Copy-Item (Join-Path $Root 'native/android-overrides/res/mipmap-anydpi-v26/ic_launcher.xml') (Join-Path $anydpi 'ic_launcher.xml') -Force
Copy-Item (Join-Path $Root 'native/android-overrides/res/mipmap-anydpi-v26/ic_launcher_round.xml') (Join-Path $anydpi 'ic_launcher_round.xml') -Force

$manifest = Join-Path $App 'AndroidManifest.xml'
if (Test-Path $manifest) {
  $s = Get-Content $manifest -Raw
  if ($s -notmatch 'android:theme="@style/AppTheme"') {
    $s = $s -replace '<application\s+', '<application android:theme="@style/AppTheme" android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round" android:label="NJUGA/CASINO" '
    Set-Content $manifest $s
  }
}
Write-Host 'Android polish applied. Run .\gradlew.bat bundleRelease from android/ for the Play Store AAB.'
