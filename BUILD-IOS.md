# Build NJUGA/CASINO for iPhone (iOS 27)

The same `www/` game code runs on Android and iPhone. The iOS app is a Capacitor
wrapper around it, configured for **iPhone only, portrait, iOS 17 minimum, built with the iOS 27 SDK**
(change `MIN_IOS` at the top of `apply-ios-polish.sh` if you want a different floor).

## You need
- A Mac with the **current Xcode (the one that ships the iOS 27 SDK)** and Node.js LTS
- A free Apple ID to run on your own iPhone; a paid **Apple Developer Program** account ($99/yr) for TestFlight / App Store

## 1. One command
```bash
./setup-ios.sh
```
This runs `npm install`, `npx cap add ios`, applies the iPhone settings (icon, splash, Info.plist, privacy manifest, device family, minimum iOS) and opens Xcode.

Manual equivalent:
```bash
npm install
npx cap add ios
bash ./apply-ios-polish.sh
npx cap sync ios
npx cap open ios
```

## 2. Run it
In Xcode: select the **App** target -> **Signing & Capabilities** -> tick *Automatically manage signing* and pick your Team. Choose an iPhone simulator or your plugged-in iPhone and press **Run**.
(First time on a real iPhone: Settings -> Privacy & Security -> Developer Mode -> On.)

If Xcode says `PrivacyInfo.xcprivacy` isn't in the target, drag `ios/App/App/PrivacyInfo.xcprivacy` into the App group and tick the App target.

## 3. After editing the game
Edit `www/index.html` (or `online.js` / `tournament.js`), then:
```bash
npx cap sync ios
```
and press Run again.

## 4. Release to the App Store
1. Xcode -> Product -> **Archive** (destination: Any iOS Device)
2. Organizer -> **Distribute App** -> App Store Connect -> Upload
3. Fill in the listing in App Store Connect using `APP-STORE-LISTING.md`
4. Use the 1024px icon in `store-assets/app-store-icon-1024.png` and the privacy policy in `PRIVACY-POLICY.html` (host it on a public URL)

## No Mac?
- Run the **iOS build** GitHub Action (`.github/workflows/ios-build.yml`) to check that the project compiles on a hosted Mac, or
- Use a cloud Mac / CI service (e.g. Codemagic, Xcode Cloud via a borrowed Mac for first setup) for signing and upload.
Apple requires Xcode to produce the final signed build.

## What was adapted for iPhone
| Area | Change |
|---|---|
| Notch / Dynamic Island / home bar | Safe-area insets on the page, overlays, settings sheet and gear button; web view runs edge-to-edge |
| Viewport height | `100dvh` so the layout isn't cut off by Safari-style toolbars |
| Text fields | 16px minimum so iOS never auto-zooms when the keyboard opens; text selection allowed inside inputs |
| Haptics | Capacitor Haptics, with the style names corrected to upper-case (`LIGHT`/`MEDIUM`) - iOS treats unknown names as *heavy* |
| Sound | Audio session set to *playback* so music/voice play even with the silent switch on; resumes after backgrounding, calls and Siri |
| Back navigation | iPhones have no back button: swipe in from the left edge on menu screens (never leaves a live game by accident) |
| Status bar | Light text over the green felt |
| Touch | 44pt gear button, no long-press callouts or link previews, no rubber-banding |
| Packaging | iPhone-only, portrait, full-bleed 1024px icon (no alpha), launch image, privacy manifest, export-compliance flag |

## Not tested on a device
This was prepared without access to a Mac, Xcode or an iPhone, so it has not been compiled or run on iOS 27. The web layer was checked in a browser at iPhone 17 Pro Max size. Expect to do a first test pass on a simulator / your phone.
