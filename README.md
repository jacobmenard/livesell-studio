# NegosyoWork Studio

A control room for live sellers: set up your camera, background, sale popups, effects and
sound effects once, save it as a **setup**, and send a clean picture (no buttons) to
TikTok, Facebook or YouTube Live.

This repository turns the NegosyoWork Studio design prototype into a working web app:

| Part | Stack |
| --- | --- |
| `frontend/` | React 19 + TypeScript, Vite 8, Tailwind CSS 4, React Router 7, Laravel Echo + Pusher JS, MediaPipe (background removal) — **Node 22.13.1** |
| `backend/` | Laravel 12 (PHP 8.2+), Sanctum (cookie sessions + CSRF for the website, bearer tokens for the Android app), Reverb (WebSockets) |
| `mobile/` | Android app: React Native 0.88 + Expo SDK 58, Expo Router, a Kotlin streaming module (RootEncoder) — see **[mobile/README.md](mobile/README.md)** |
| `website/` | Public landing page for the Android app (Home, Plans, Get the app, Contact): static HTML, CSS and JS, no build step — see **[website/README.md](website/README.md)** |
| Database | MySQL 8 |

## What works

- **Accounts** — sign up, log in (rate-limited, generic error), "keep me logged in", log out,
  forgot / reset password (email link to the SPA). Theme choice is saved to the account.
- **My setups** — your setups plus six starter templates, with live thumbnails, tabs,
  search, sort, duplicate, delete (with confirm), empty / no-match / loading states.
- **Live Setup editor**
  - Camera: pick a real camera (webcam, HDMI capture card, streaming box, phone-webcam app),
    shape 16:9 / 9:16, 720p / 1080p, brightness, zoom, mirror.
  - Background: None, **Blur** and **Picture** (person cut out with MediaPipe, no green
    cloth), **Green screen** (GPU chroma key with similarity / edge smoothness), six built-in
    backdrops and your own photos.
  - Popups: the nine built-ins, your own text popups (24 chars, 4 colors) and image
    popups; position (9 spots), size, entrance, effect (fireworks, confetti, banderitas,
    applause, sparkles, hearts), once / keep playing, auto-hide, linked sound.
  - 13 sound pads with working keyboard shortcuts (1–0, Q, W, E), volume, "Send to live",
    "Hear it myself", and your own uploaded sounds.
  - Save (Ctrl/Cmd+S too), "Not saved yet" tracking, and a guard before leaving with
    unsaved changes.
- **Clean screen** — the same stage drawing as the preview, following the editor live over
  Reverb (with automatic polling fallback):
  - `/setups/:id/screen` — your own window to capture in TikTok LIVE Studio / OBS.
  - `/output/:token` — a private Browser Source link. The token is shown once and stored
    only as a SHA-256 hash; "Make a new link" turns the old one off.
  - See-through mode (popups and effects only) for sellers whose camera is already in OBS.
  - Sounds tapped with "Send to live" play on the clean screen, so OBS captures them.
  - Camera sound (the camera's own mic or HDMI capture-card audio, else the default
    microphone) plays on the clean screen too. Turn off "Send camera sound to the live"
    in the Camera step if OBS / LIVE Studio already adds your mic, to avoid hearing it twice.
- **Stream destinations** — server + key per platform, validated, key **encrypted at rest**
  and never sent back (only a hint).
- **Stream straight to Facebook / YouTube (RTMP/RTMPS)** — no OBS needed: the clean screen
  shares its own tab and the local relay (`relay/`) publishes it with FFmpeg. See
  [Streaming straight to a platform](#streaming-straight-to-a-platform).

### Not in this release (needs a desktop app)

The "NegosyoWork Studio Camera" virtual webcam can't run in a browser; OBS's **Start Virtual
Camera** on the clean screen does the job today. Built-in QR phone pairing is also future
work; phone-webcam apps work now.

## Run it locally

Prerequisites: PHP 8.2+ with `gd`, `pdo_mysql`, `mbstring`, Composer 2, MySQL 8,
and **Node 22.13.1** (`nvm use` / `fnm use` / Volta read the pinned version).

### 1. Database

```sql
CREATE DATABASE livesell CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE livesell_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; -- for tests
CREATE USER 'livesell'@'localhost' IDENTIFIED BY 'choose-a-password';
GRANT ALL ON livesell.* TO 'livesell'@'localhost';
GRANT ALL ON livesell_test.* TO 'livesell'@'localhost';
```

### 2. Backend (`backend/`)

```bash
cd backend
composer install
cp .env.example .env            # set DB_PASSWORD, and the REVERB_APP_* values
php artisan key:generate
php artisan migrate --seed      # tables + the six starter templates (+ demo user locally)
php artisan storage:link        # serves uploads from /storage

php artisan serve               # API on http://localhost:8000
php artisan reverb:start        # WebSockets on :8080 (second terminal)
```

For `REVERB_APP_ID / KEY / SECRET`, any random strings work locally
(e.g. `php -r "echo bin2hex(random_bytes(16));"`).

Keep `reverb:start` running while you're live: it's what makes a popup tap show on the clean
screen at once. Without it the app still works, but the clean screen only checks for changes
every second.

Local demo login (seeded only when `APP_ENV=local`): `demo@livesell.test` / `livesell-demo`.

### 3. Frontend (`frontend/`)

```bash
cd frontend
nvm use                         # Node 22.13.1
npm ci
cp .env.example .env            # set VITE_REVERB_APP_KEY = backend REVERB_APP_KEY
npm run dev                     # http://localhost:5173 (proxies /api, /sanctum, /storage, Reverb)
npm run dev:lan                 # over HTTPS on localhost and your LAN IP (https://<your-ip>:5173)
```

Browsers only allow the camera and microphone on `https://` or `http://localhost`, so
`dev:lan` serves HTTPS with a self-signed certificate. The first visit shows a "not private"
warning: choose **Advanced → Proceed** (once per browser). Use `npm run dev:lan` rather than
`npm run dev -- --host` on Windows: PowerShell drops the `--`, so the flags never reach Vite.

### 4. Streaming relay (`relay/`, optional)

Only needed for **Go live → Stream straight to Facebook or YouTube**.

```bash
winget install --id Gyan.FFmpeg  # once; any FFmpeg with rtmps works (restart the terminal after)
cd relay
npm ci
cp .env.example .env             # RELAY_SECRET = the same value as RELAY_SECRET in backend/.env
npm start                        # ws://127.0.0.1:8090/relay (the Vite dev server proxies /relay)
```

Generate the shared secret with
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, put it in both
`backend/.env` and `relay/.env`, and restart `php artisan serve`.

### 5. Free trial and payments (GCash)

New sign-ups get a **free week** with Solo's limits, so they can go live
(`LIVESELL_TRIAL_DAYS`, `LIVESELL_TRIAL_PLAN`; 0 days turns it off). After that they're on
**Free**: they can set everything up but can't go live. Solo / Duo / Team are paid by hand,
and the superadmin checks each payment:

1. As the superadmin, open **Payments** → **Payment methods** and add your GCash, Maya or
   bank accounts (each can be turned off). Until one is on, sellers see "Payments open soon".
2. A seller picks a plan on **Plan**, chooses how they'll pay, sends the exact price to that
   account, and submits the reference number with a receipt screenshot. Each payment keeps a
   copy of where it was sent, even if the method is edited or deleted later.
   The amount always comes from the plan, and receipts are stored on the private disk
   (`storage/app/private/payment-proofs`), shown only to the account owner and the superadmin.
3. The seller gets a "we received your payment" email. The superadmin, and the business
   inbox in `LIVESELL_PAYMENTS_EMAIL` (e.g. support@), get an email and a badge on
   **Payments**; the superadmin checks the receipt against what reached that account, then
   **Approves** (the plan runs one month from the approval date and any
   free week ends) or **Rejects** with a reason the seller sees. The seller gets an email
   either way.
4. Reminders: 3 days before a paid plan ends and 2 days before the free week ends, the
   owner gets an "ends soon" email (`LIVESELL_PLAN_REMINDER_DAYS`,
   `LIVESELL_TRIAL_REMINDER_DAYS`), once each and not while a payment is being checked. This
   and pausing sub-users when a plan runs out need the scheduler (`php artisan schedule:run`
   every minute; DEPLOY.md step 11).
5. Renewing: the Plan page shows the next month as a row to click. It can be paid anytime in
   the last month of the current one, and adds a month after it (never more than one ahead).
   Switching to another plan starts a fresh month on approval; days left aren't carried over.

Emails use Laravel's mailer: locally `MAIL_MAILER=log` writes them to
`storage/logs/laravel.log`. Set real SMTP settings in `backend/.env` to send them.

### Streaming straight to a platform

1. In the editor, open **Go live → Stream straight to Facebook or YouTube**, pick the
   platform, paste the server URL and stream key (Facebook: Live Producer → Streaming
   software; YouTube: Studio → Go live → Stream) and **Save**.
2. Click **Go live on Facebook**. The clean screen opens; click **Start streaming** and choose
   **Share**. Your voice and sound effects are mixed straight into the live, so the clean-screen
   window itself stays silent (nothing for your microphone to pick up again).
3. The editor shows **● Live on Facebook**. On Facebook, click **Go live** in Live Producer
   once the preview appears (YouTube starts by itself if auto-start is on).
4. **Stop streaming** in the editor (or Chrome's **Stop sharing**) ends it. Keep the
   clean-screen window open, and not minimized, while you're live.

How it stays safe: the browser only ever gets a one-time ticket (60 s). The relay, which
holds `RELAY_SECRET`, swaps it with Laravel for the server and key and hands them to FFmpeg;
the key is never sent to the browser or shown in errors. Chrome or Edge on a computer is
required (tab sharing). A bigger clean-screen window gives a sharper live.

**Delay on the platform.** Viewers always see the live a few seconds late: that's the
platform's own player buffer, not the app. To shorten it, choose **Low latency** in Facebook
Live Producer (Settings → Stream latency) and **Ultra low-latency** in YouTube Studio
(Stream settings → Stream latency) before going live. TikTok has no such setting.

### Checks

```bash
# backend
php artisan test                # PHPUnit feature + unit tests (uses livesell_test)
./vendor/bin/pint --test        # code style

# frontend
npm run typecheck
npm run lint
npm test
npm run build

# relay
npm test                        # node --test
```

## How it fits together

```
 Seller's browser                                   Laravel API (+ MySQL)
 ┌──────────────────────────┐   PUT /setups/:id      ┌───────────────────────┐
 │ Editor (React)           │──────────────────────▶ │ setups, setup_popups  │
 │  camera → compositor     │   PUT …/scene (live)   │ media, output_links   │
 │  popups, effects, sounds │──────────────────────▶ │ stream_destinations   │
 └──────────────────────────┘                        └──────────┬────────────┘
                                                                │ broadcast
 Clean screen (OBS / LIVE Studio)                    ┌──────────▼────────────┐
 ┌──────────────────────────┐◀── scene.updated ──────│ Reverb (WebSockets)   │
 │ same Stage component     │◀── sound.played  ──────│ private channels      │
 └──────────────────────────┘                        └───────────────────────┘
```

- Video never leaves the seller's computer. The server stores settings, uploads and the
  current "scene" (what's on screen), and relays changes.
- `frontend/src/stage/` is the shared drawing used by the preview, dashboard thumbnails and
  the clean screen, so they always match. Sizes use a stage unit (1% of the short side),
  so a popup looks the same at 340 px and at 1080×1920.
- Popup looks, effects, sounds and backgrounds are a fixed catalog
  (`frontend/src/stage/catalog.ts` ↔ `backend/app/Support/Catalog.php`). The API accepts
  only catalog keys, plain text (≤ 24 chars, no control characters) and the seller's own
  media ids — never styles, URLs or HTML.

## Security notes

- Cookie sessions (httpOnly, `SameSite=Lax`) with CSRF protection via Sanctum; passwords
  hashed with bcrypt; log-in limited to 5 tries/minute per email+IP.
- Every setup, upload and link request is checked against the signed-in seller; someone
  else's setup answers **404** so ids can't be probed.
- Uploads: type detected from file content, 5 MB limit, images re-encoded to strip
  metadata (EXIF orientation is applied first), 25-megapixel cap, random file names. In
  production point `MEDIA_DISK` at S3-style storage on a separate domain.
- Clean-screen tokens: 48 random characters, stored as SHA-256 only, read-only, and each
  link can join only its own private channel.
- Stream keys: `encrypted` cast at rest, hidden from serialization, only a hint returned.
- Android app: signs in at `/api/mobile/login` for a Sanctum token (90 days, newest 5 phones
  kept, only its SHA-256 stored), kept in the phone's Keystore-backed secure storage. Logging
  out, a password reset or a paused team seat turns the token off. The app's stream keys
  never reach the server, and video goes from the phone straight to the platform.

## Production checklist

Step-by-step for a VPS with CloudPanel (e.g. Hostinger KVM 2): **[DEPLOY.md](DEPLOY.md)**, with
the Nginx rules, Supervisor programs and `.env` templates in [`deploy/`](deploy/).

- Serve `frontend/dist` and the API from the **same domain** (e.g. nginx: `/` → SPA with
  history fallback, `/api`, `/sanctum`, `/storage` → Laravel). Set `SESSION_DOMAIN`,
  `SANCTUM_STATEFUL_DOMAINS`, `FRONTEND_URL`, `SESSION_SECURE_COOKIE=true`.
- Run `php artisan reverb:start` under a process manager behind TLS; set
  `REVERB_ALLOWED_ORIGINS` to your domain and the `VITE_REVERB_*` values to match.
- Self-host the segmentation model (`selfie_segmenter.tflite`) and the face model
  (`face_landmarker.task`), and set `VITE_SEGMENTER_MODEL_URL` and `VITE_FACE_MODEL_URL`; MediaPipe's WebAssembly runtime is already served from
  `/mediapipe/wasm`.
- Replace the synthesized placeholder sounds with licensed recordings
  (`SOUND_FILES` in `frontend/src/stage/sounds.ts`). Check platform rules on sounds like
  gunshots before shipping them.
- Configure mail for password-reset emails, and run the scheduler
  (`php artisan schedule:work`) to clear expired reset tokens.
