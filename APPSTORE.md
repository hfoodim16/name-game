# Shipping The Name Game to the App Store (and Play Store)

The web app is now **native-ready** via [Capacitor](https://capacitorjs.com):

- `capacitor.config.json` — app id `com.harryfoodim.namegame`, name "The Name
  Game", web assets in `public/`.
- Inside a native shell the app automatically talks to the **deployed server**
  for online play + the athlete database (`public/js/config.js` → `NG_REMOTE`),
  while Pass & Play and the Daily Chain run locally.
- The Socket.io client is bundled (`public/js/socket.io.min.js`) and the server
  sends CORS headers, so the native app can connect cross-origin.

Everything below happens on **your Mac** — it needs Xcode and an Apple account,
which can't be done from the dev sandbox.

## Prerequisites
- macOS with **Xcode** (from the Mac App Store) + Command Line Tools
- **CocoaPods**: `sudo gem install cocoapods`
- **Apple Developer Program** membership ($99/year) to publish (free for
  simulator/device testing)
- For Android: **Android Studio**

## 1. Install & add the native platforms
```bash
cd "Claude Projects/name-game"
npm install
npx cap add ios
npx cap add android      # optional, for Google Play
```
This generates `ios/` and `android/` folders (gitignored — they're regenerable).

## 2. Generate app icons + splash
The icon source is `public/icon.svg`. Capacitor's asset tool wants a 1024×1024
PNG — export `icon.svg` to `assets/icon.png` (and optionally `assets/splash.png`
2732×2732), then:
```bash
npm install -D @capacitor/assets
npx @capacitor/assets generate --ios --android
```

## 3. Sync web assets into the native projects
```bash
npx cap sync
```
Re-run this after any change to the web app (`public/`).

## 4. Open in Xcode and run
```bash
npm run cap:ios        # = cap sync ios && cap open ios
```
In Xcode:
1. Select the **App** target → **Signing & Capabilities** → pick your **Team**
   (your Apple ID). Bundle Identifier is already `com.harryfoodim.namegame`.
2. Choose a simulator or your plugged-in iPhone → press **▶ Run**.
3. Test: Daily Chain + Pass & Play (work offline), and Play Online (connects to
   `name-game-oivo.onrender.com`). Give the free server ~30s to wake if idle.

## 5. Submit to the App Store
1. In Xcode: **Product → Archive**, then **Distribute App → App Store Connect**.
2. At [appstoreconnect.apple.com](https://appstoreconnect.apple.com): create the
   app, add screenshots (grab from the simulator), description, category
   (Games), age rating, and a privacy label — the app collects **no personal
   data** (names entered are gameplay-only; stats stay on-device).
3. Submit for review.

## Android / Play Store
```bash
npm run cap:android    # opens Android Studio
```
Build a signed release (AAB) and upload via the
[Play Console](https://play.google.com/console) ($25 one-time).

## Notes
- **If you move hosts**, update `NG_REMOTE` in `public/js/config.js`, then
  `npx cap sync`.
- This is a real bundled app (Daily Chain + Pass & Play work without a network),
  not a thin web-view wrapper — that matters for App Store review guideline 4.2.
- **Future enhancement:** bundle `data/athletes.json` into `public/` so even the
  first launch works fully offline (right now the database loads from the server
  on first run, then caches).
