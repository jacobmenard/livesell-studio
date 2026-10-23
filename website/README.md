# NegosyoWorks website

The public landing page for the NegosyoWork Studio Android app: **Home**, **Plans**,
**Get the app** (download and first steps) and **Contact**. It is plain HTML, CSS and
JavaScript with no build step, so any static web host can serve this folder as it is.

```
website/
├─ index.html                 the page (all four sections; #plans, #app, #contact switch them)
├─ assets/
│  ├─ css/styles.css          colours, type and layout (light and dark follow the visitor's phone)
│  ├─ js/config.js            ← the only file you normally edit: download link and contact details
│  ├─ js/main.js              page switching, the live demo, plans, download box, contact links
│  ├─ js/lib/qrcode.min.js    QR code for the download link (qrcodejs 1.0.0, MIT licence)
│  └─ favicon.svg
└─ app/                       put the APK here when it is ready (APK files are not committed)
```

## Change the download link or contact details

Edit `assets/js/config.js`:

```js
window.NEGOSYOWORKS_CONFIG = {
  app: {
    apkUrl: "/app/negosyowork-studio.apk", // a path on this website, or a full https:// address
    appVersion: "1.0.0",                   // optional, shown next to the download
    apkSizeMb: "42"                        // optional
  },
  contact: {
    facebook: "https://www.facebook.com/…",
    whatsapp: "+639…",
    email: "…@gmail.com"
  }
};
```

- While `apkUrl` is `""`, the Get the app page says the download isn't up yet and asks
  people to message you. Once it is set, the page shows a **Download the app** button and, on a
  computer, a QR code to scan with the phone.
- Only a path starting with `/` or an `https://` address is accepted, so a typo can't turn the
  button into a broken or unsafe link.
- Leave a contact field `""` to hide that row on the Contact page.

Prices, plan features and wording live in `index.html` and in `PLANS` / `COMPARE` at the top
of `assets/js/main.js`. They match the launch prices in
`backend/database/migrations/2026_10_06_000500_set_launch_plan_prices.php`
(Free ₱0, Solo ₱299, Duo ₱599, Team ₱999) and the 7-day free week in
`backend/config/livesell.php`. Change them there and here together.

## Preview on your computer

Any static server works, for example:

```bash
cd website
python3 -m http.server 8080
# open http://localhost:8080
```

Opening `index.html` straight from the file manager also works, apart from the fonts if you
are offline.

## Put it online (CloudPanel)

The website is served straight from the code already on the VPS (the API site's folder from
[DEPLOY.md](../DEPLOY.md)), the same way the app site is. So the usual update
(`bash deploy/deploy.sh`, which runs `git pull`) updates the website too.

1. Point the domain at the VPS: an **A record** for the website's address (e.g. the main
   domain, `@`) with value = `VPS_IP`.
2. CloudPanel → **Add Site** → **Create a Static HTML Site**: domain `WEBSITE_DOMAIN`
   (e.g. `example.com`), any site user. Then its **SSL/TLS** → **New Let's Encrypt
   Certificate** → Create.
3. That site → **Vhost**: replace everything with the contents of
   [`deploy/nginx-website.conf`](../deploy/nginx-website.conf), replace `WEBSITE_DOMAIN`,
   `SITE_USER` (the API site's user) and `DOMAIN` (the API site's folder), then **Save**.
4. Open `https://WEBSITE_DOMAIN`. Check Home, Plans, Get the app and Contact.

### When the APK is ready

1. Build and sign it as described in
   [mobile/README.md](../mobile/README.md#build-the-apk-you-publish).
2. Upload it to the server as `~/htdocs/DOMAIN/website/app/negosyowork-studio.apk` (as the API
   site's user). Git ignores APK files, so later pulls leave it in place.
3. In `website/assets/js/config.js`, set `apkUrl: "/app/negosyowork-studio.apk"` (plus
   `appVersion` and `apkSizeMb`), commit and push, then run `bash deploy/deploy.sh` on the
   server. Change it in the repo, not only on the server, or the next pull can't update cleanly.
4. In `backend/.env`, set `ANDROID_APP_APK_URL=https://WEBSITE_DOMAIN/app/negosyowork-studio.apk`
   and the other `ANDROID_APP_*` lines, then `php8.4 artisan config:cache`, so installed apps
   offer the same file as an update.

The website's Vhost sends `.apk` files as an Android app to install and never caches them, so a
new upload is what people download straight away.
