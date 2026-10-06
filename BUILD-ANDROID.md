# Build NJUGA/CASINO for Android

## 1. Install prerequisites

Install:
- Node.js (LTS recommended)
- Android Studio
- Android SDK and Android SDK Platform Tools

## 2. Open a terminal in this folder

Windows PowerShell:

```powershell
.\setup-android.ps1
```

macOS/Linux:

```bash
./setup-android.sh
```

Or run the commands manually:

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android
```

## 3. Run the game

In Android Studio, wait for Gradle sync to finish, choose an emulator or connected Android phone, and press **Run**.

## 4. Make changes to the game

Edit:

`www/index.html`

Then run:

```bash
npx cap sync android
```

Re-run the Android app.

## 5. Make a release build

For testing, Android Studio can generate an APK.

For Google Play, generate a signed **Android App Bundle (.aab)** from:

**Build → Generate Signed Bundle / APK**

Choose **Android App Bundle** for Play Store distribution.

## 6. Before publishing

Recommended finishing tasks:
- Replace the temporary app icon with final NJUGA/CASINO artwork.
- Add a splash screen.
- Test all game controls on several Android screen sizes.
- Test audio behaviour when the phone is muted/backgrounded.
- Test settings persistence after force-closing the app.
- Add a clear About/Privacy screen if the app will be published.
- Choose and permanently keep the final application ID: `com.njugacasino.game`.
