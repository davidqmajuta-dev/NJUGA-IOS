# Play Store release checklist

## 1. Prepare the machine
Install Node.js, Android Studio, Android SDK Platform 36, and the Android SDK Build-Tools required by the generated Capacitor project.

## 2. Generate the native Android project
From this folder:

```bash
npm install
npx cap add android
npx cap sync android
```

Then apply the native polish:

Windows PowerShell:

```powershell
.\apply-android-polish.ps1
```

macOS/Linux:

```bash
./apply-android-polish.sh
```

## 3. Test on a phone
Enable USB debugging on your test device, connect it, then open Android Studio:

```bash
npx cap open android
```

Run the `app` configuration on the device. Test rotation, Android back, audio, settings, new games, end-of-round scoring, and app resume.

## 4. Create a signed release
In Android Studio choose **Build → Generate Signed Bundle / APK → Android App Bundle**.

Use a release keystore and keep the upload key backed up securely. For Google Play, upload the `.aab` bundle rather than relying on a debug APK.

## 5. Play requirements
New Google Play apps submitted from 31 August 2026 must target Android 16 / API 36 or higher. This project is configured to target API 36.

New Play apps use Android App Bundles (AAB). Enrol in Play App Signing when creating the release.

## 6. Store listing
Use:
- `PLAY-STORE-LISTING.md` for the listing copy.
- `store-assets/play-store-icon-1024.png` for the high-resolution app icon source.
- `store-assets/feature-graphic-1024x500.png` for the feature graphic.
- `PRIVACY-POLICY.html` as the starting privacy-policy page.

You still need to supply real screenshots from the finished Android build and complete the Play Console declarations, content rating, Data safety form, app access information, developer verification and any testing requirements that apply to your Play Console account.
