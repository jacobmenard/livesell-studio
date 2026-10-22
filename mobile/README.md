# NegosyoWork Studio for Android

The phone app for live sellers: pick a setup, tap popups and sound effects, and go live
**straight from the phone** to Facebook, YouTube or TikTok. It uses the same Laravel API
as the website (`../backend`) for accounts, setups and the plan, and is shipped as an APK
from the NegosyoWork website rather than Google Play.

| | |
| --- | --- |
| Framework | React Native 0.88 + Expo SDK 58, Expo Router, TypeScript (strict) |
| Server state | TanStack Query |
| Streaming | `modules/live-streamer` — a local Expo module (Kotlin) around [RootEncoder](https://github.com/pedroSG94/RootEncoder) 2.8.1 (Apache-2.0) |
| Secrets on the phone | `expo-secure-store` (Android Keystore) for the API token and stream keys |
| Platforms | Android 8.0+ (minSdk 26). No iOS build, no push notifications |

## How it works

```
 Phone (this app)                                          NegosyoWork server (Laravel)
 ┌──────────────────────────────────────────────┐          ┌──────────────────────────┐
 │ Screens (src/app)  ──HTTPS + Bearer token──────────────▶ │ /api/mobile/login …      │
 │   setups, plan, live-session heartbeat       │          │ /api/setups, /subscription│
 │                                              │          │ /api/setups/{id}/live-…  │
 │ LiveStreamerView (Kotlin, RootEncoder)       │          └──────────────────────────┘
 │   camera ─▶ OpenGL look/background ─▶        │
 │            foreground + popups overlay ─┐    │
 │   mic ─▶ sound-effect mixer ────────────┼─ RTMP(S) ────▶ Facebook / YouTube / TikTok
 │   stream key from secure storage ───────┘    │          (never through our server)
 └──────────────────────────────────────────────┘
```

- **Video never touches the VPS.** The phone encodes and sends the live itself, so the
  server only handles logins, setups and a heartbeat — cheap at any number of sellers.
- **Stream keys stay on the phone**, encrypted with an Android Keystore key. They are not
  sent to the server (the website's server-side destinations are not used by the app).
- **What viewers see** is exactly the preview: the camera with the setup's look, colour
  filter and background (`StageFilterRender.kt`, shaders in the module's
  `assets/livestreamer/shaders/`), then the foreground banner and popups drawn into the video
  frames by `OverlayRenderer.kt`. The app's buttons are React Native views on top and never
  reach the stream.
- **Camera look, filters and backgrounds match the website.** `src/stage/stageLook.ts` turns
  a setup into shader-ready numbers using the website's formulas (`enhance.ts`, `chroma.ts`,
  the 17 filters); the GLSL is a port of the website's shaders and was checked against them
  pixel by pixel (within 1/255). Blur and Picture find the person with Google ML Kit selfie
  segmentation, which runs on the phone (the model is bundled, about 4.5 MB of the APK). On a
  phone where it can't run, the live goes on with the real room and the seller is told;
  green screen needs no segmentation.
- **The editor previews with the real camera** (camera permission only; the microphone is
  asked for when going live), so a look is judged on the actual picture. Without the camera
  it shows a stand-in.
- **Sound effects** are mixed into the microphone audio before encoding (`SoundMixer.kt`),
  so viewers hear a clean "ka-ching" and the microphone doesn't pick it up a second time.
- **The plan's limit** ("setups live at once") is claimed before streaming starts with
  `POST /api/setups/{id}/live-sessions` (`source: app`) and kept with a heartbeat. A free
  account sees why it can't go live before anything is sent.
- **Dropped signal**: RootEncoder retries 24 times, 5 s apart (about 2 minutes), while the
  app shows the Reconnecting screen; "Try now" reconnects at once.

### What this first version does not do yet

- **Face effects** (the 70 face-tracked effects set on the website) are not drawn in phone
  lives yet. The editor says so when a setup has one.
- **Animated GIF** backgrounds and foregrounds show their first frame on the phone.
- On the phone, **zoom** goes from 1× to 2×; the website's zoom-out (below 0) shows the whole
  camera picture, as the phone's camera already fits the shape.
- Popup **animations and effects** (fireworks, confetti…) are not drawn in the phone's
  stream; the popup appears without them.
- Sellers' **own uploaded sounds** can't be played from the phone (built-in pads only).
- **OBS on this Wi-Fi** (sending the phone's picture to a PC) is shown as "Coming soon".
- **Comments** are not shown in the app: they stay in the TikTok / Facebook app.
- Paying for a plan opens the website (GCash, Maya or bank, checked by the team).

## Project layout

```
mobile/
├─ app.config.ts            app name, package id, permissions, plugins
├─ plugins/withReleaseSigning.js   release APKs use your upload key (never the debug key)
├─ modules/live-streamer/   native streaming module (Kotlin) + its TypeScript API
│  └─ android/src/main/assets/livestreamer/  popup font, the 13 sound effects (WAV),
│                              GLSL shaders and the six built-in backgrounds (1920×1080)
├─ scripts/render-sounds.mjs   renders the website's synthesized sounds to WAV
└─ src/
   ├─ app/                  screens (Expo Router): login, (tabs)/…, setup/[id], live/…
   ├─ api/                  fetch client, endpoints, API types
   ├─ auth/                 token storage + AuthProvider
   ├─ stage/                popup look and placement, camera look, filters and backgrounds
   │                        (same rules as the website)
   ├─ media/                photo picking and checks before upload
   ├─ stream/streamKeys.ts  stream keys in secure storage
   ├─ live/                 live-session heartbeat, permissions, formatting
   └─ components/           UI kit, popup art, setup cards, update sheet
```

## Before you start

- **Node 22** (same as `frontend/`), **JDK 17**, and **Android Studio** with the Android
  SDK (it installs the platform and build tools the first time you build).
- An Android phone with **Developer options → USB debugging** turned on (the camera and
  streaming need a real phone; the emulator has no real camera).
- The backend running with the new migration (it adds the token table):

  ```bash
  cd ../backend
  composer install
  php artisan migrate
  php artisan test --filter=MobileAuthTest   # the app's sign-in and version endpoints
  ```

## Run it on your phone (development build)

The app has native code, so it runs in its own development build, not in Expo Go.

```bash
cd mobile
cp .env.example .env.local      # set EXPO_PUBLIC_API_URL (see the comments in the file)
npm install
npx expo run:android            # generates android/, builds and installs on the phone
```

After the first install, `npm start` serves JavaScript changes to the installed app.
Change anything under `modules/` or `app.config.ts`, and run `npx expo run:android` again.

`EXPO_PUBLIC_API_URL` for a phone on the same Wi-Fi as your computer is
`http://<your computer's LAN IP>:8000` (start Laravel with `php artisan serve --host=0.0.0.0`).
Development builds allow plain `http://`; release builds don't.

## Checks

```bash
npm run typecheck   # tsc --noEmit (strict)
npm run lint        # expo lint
npm test            # Jest: popup look/placement, scene, API client, stream keys, formatting
```

## Build the APK you publish

### 1. Make your upload key — once, and keep it safe

Every update **must** be signed with the same key, or phones refuse to install it over the
old app. Back the file and passwords up somewhere other than the build computer.

```bash
keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 \
  -keystore ~/negosyowork-upload.jks -alias negosyowork
```

Then add to `~/.gradle/gradle.properties` on the build computer (never commit these):

```properties
NEGOSYOWORK_UPLOAD_STORE_FILE=/home/you/negosyowork-upload.jks
NEGOSYOWORK_UPLOAD_STORE_PASSWORD=your-store-password
NEGOSYOWORK_UPLOAD_KEY_ALIAS=negosyowork
NEGOSYOWORK_UPLOAD_KEY_PASSWORD=your-key-password
```

Without these the release build stops with a "missing storeFile" error on purpose, so a
debug-signed APK can never be published by accident.

### 2. Build

```bash
cd mobile
# Bump android.versionCode in app.config.ts first (and version for people to read).
APP_ENV=production EXPO_PUBLIC_API_URL=https://<your NegosyoWork domain> npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Install it on a test phone (`adb install -r app-release.apk`) and go live once on each
platform you support before publishing.

### 3. Publish

1. Upload the APK to your website over HTTPS, e.g. `https://<domain>/app/negosyowork-studio.apk`.
2. In the backend `.env`, set `ANDROID_APP_VERSION_CODE` (the new versionCode),
   `ANDROID_APP_VERSION_NAME`, `ANDROID_APP_APK_URL`, `ANDROID_APP_SIZE_MB` and
   `ANDROID_APP_NOTES` (items separated by `|`), then `php artisan config:cache`.
   Installed apps then offer the update. Raise `ANDROID_APP_MIN_VERSION_CODE` only when an
   API change would break older apps: those then show only the update screen.
3. **Android developer verification**: Google enforces verified developers for sideloaded
   apps in some countries since 30 Sep 2026 and plans it everywhere in 2027. Register in the
   [Android Developer Console](https://developer.android.com/developer-verification) and add
   the package name `ph.negosyowork.studio` with this same upload key, so sellers can keep
   installing without extra warnings.

## Sounds

The 13 sound pads are rendered from the website's synthesis (`frontend/src/stage/sounds.ts`)
into `modules/live-streamer/android/src/main/assets/livestreamer/sounds/` by
`npm run render-sounds`. To use licensed recordings instead, replace those files with 16-bit
PCM WAVs of the same names (any sample rate; mono or stereo).

## Pictures from the server

Background and foreground photos are loaded by the phone from the URLs the API gives
(`GET /api/media`). A path like `/storage/…` is completed with `EXPO_PUBLIC_API_URL`
(`absoluteUrl()` in `src/config.ts`). A full URL on `localhost` / `127.0.0.1` (a server whose
`APP_URL` or `PUBLIC_STORAGE_URL` is localhost) is sent to `EXPO_PUBLIC_API_URL` too, since on
the phone "localhost" is the phone. Any other full URL (your domain, a CDN) is used as it is.
Uploads from the phone go to `POST /api/media` (PNG, JPG, WEBP or GIF, 5 MB at most).

## Fonts

Popups use Bricolage Grotesque ExtraBold (SIL Open Font License, see
`assets/fonts/OFL-BricolageGrotesque.txt`), bundled twice: for React Native text in
`assets/fonts/` and for the native renderer in the module's assets.
