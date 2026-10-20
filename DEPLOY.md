# Deploying NegosyoWork Studio on a Hostinger VPS with CloudPanel

This guide puts the whole app on one VPS (Hostinger KVM 2, Ubuntu 24.04, CloudPanel), on two
addresses: the **app** sellers open (e.g. `app.yourdomain.com`), and the **API** behind it
(e.g. `api.yourdomain.com`: Laravel, the database, Reverb for instant popups and the streaming
relay for streaming straight to Facebook / YouTube). It takes about an hour the first time.

Everything you paste lives in [`deploy/`](deploy/). Throughout, replace:

| Placeholder | What to put |
|---|---|
| `DOMAIN` | The API's address, e.g. `api.yourdomain.com` (no `https://`). The code lives in its folder. |
| `APP_DOMAIN` | The app's address sellers open, e.g. `app.yourdomain.com` |
| `PARENT_DOMAIN` | What both share, e.g. `yourdomain.com` |
| `SITE_USER` | The API site's user you create in CloudPanel (step 2), e.g. `negosyowork` |
| `VPS_IP` | Your VPS's IP address (Hostinger → VPS → Overview) |

> Never paste real passwords or keys into GitHub, chats or screenshots. They only go into the
> `.env` files on the server.

---

## 0. Before you start

1. **Push the latest code to GitHub** from your computer (the server downloads it from there):
   ```bash
   git add -A
   git commit -m "Prepare deployment"
   git push
   ```
2. **Point your domain at the VPS.** At your domain provider (or Hostinger → Domains → DNS),
   add two **A records** with value = `VPS_IP`: name = `api` and name = `app`.
   It can take a few minutes to an hour to work.

## 1. Open CloudPanel

1. Hostinger → VPS → your KVM 2 → make sure the OS is **Ubuntu 24.04 with CloudPanel**.
2. Open `https://VPS_IP:8443` in your browser. Accept the certificate warning the first time
   and create your CloudPanel admin account.
3. Recommended: CloudPanel → **Security** → allow port 8443 only from your own IP.

## 2. Create the site

1. CloudPanel → **Add Site** → **Create a PHP Site**.
2. Application: **Laravel 12** (or the newest Laravel shown), PHP **8.4**.
3. Domain name: `DOMAIN`. Site user: `SITE_USER`, with a strong password (save it).
4. Open the new site → **Settings** → **Root Directory**: change it to `backend/public` → Save.
5. **SSL/TLS** → **Actions → New Let's Encrypt Certificate** → Create.
   (Your domain must already point to the VPS, step 0.)
6. **Databases** → **Add Database**: pick a name, user and strong password. Save all three.
7. Back in **Sites** → **Add Site** → **Create a Static HTML Site**: domain `APP_DOMAIN`, any
   site user (nothing is put in its folder). Then its **SSL/TLS** → **New Let's Encrypt
   Certificate** → Create. Its Vhost is set in step 9.

## 3. Install FFmpeg and Supervisor (as root)

Connect as root (Hostinger → VPS → **Browser terminal**, or `ssh root@VPS_IP`):

```bash
apt update && apt install -y ffmpeg supervisor git
```

## 4. Get the code onto the server (as the site user)

Switch to the site user (from the root terminal):

```bash
su - SITE_USER
```

**If your GitHub repository is private**, give the server read-only access with a deploy key:

```bash
ssh-keygen -t ed25519 -C "negosyowork-server" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy the printed line → GitHub → your repo → **Settings → Deploy keys → Add deploy key**
(leave "Allow write access" off). Then download the code:

```bash
cd ~/htdocs/DOMAIN
ls -A          # CloudPanel may have left a sample file; the folder must be empty:
rm -rf ./* ./.[!.]* 2>/dev/null
git clone git@github.com:jacobmenard/livesell-studio.git .
```

(Public repository: `git clone https://github.com/jacobmenard/livesell-studio.git .` instead.)

## 5. Install Node.js 22 (as the site user)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22.13.1
which node        # note this path for step 10 (e.g. /home/SITE_USER/.nvm/versions/node/v22.13.1/bin/node)
```

## 6. Backend (as the site user)

```bash
cd ~/htdocs/DOMAIN/backend
[ -f .env ] || cp ../deploy/backend.env.production.example .env   # never replaces a filled-in .env
php8.4 $(which composer) install --no-dev --optimize-autoloader
php8.4 artisan key:generate
```

Create the Reverb and relay secrets (written straight into `.env`, never shown):

```bash
bash ../deploy/make-secrets.sh
```

Now edit `.env` (`nano .env`, save with Ctrl+O, Enter, exit with Ctrl+X) and replace every
`DOMAIN`, `APP_DOMAIN`, `PARENT_DOMAIN` and the remaining `CHANGE_ME`: database name/user/password (step 2), your email
provider's SMTP details, and your superadmin email and a strong password.

Then set up the database and files:

```bash
php8.4 artisan migrate --force
php8.4 artisan db:seed --force          # starter templates + your superadmin account
php8.4 artisan storage:link
php8.4 artisan config:cache
php8.4 artisan route:cache
```

## 7. Frontend (as the site user)

```bash
cd ~/htdocs/DOMAIN/frontend
[ -f .env ] || cp ../deploy/frontend.env.production.example .env
bash ../deploy/make-secrets.sh    # copies REVERB_APP_KEY from backend/.env
nano .env      # replace DOMAIN
npm ci
npm run build
```

## 8. Streaming relay (as the site user)

```bash
cd ~/htdocs/DOMAIN/relay
[ -f .env ] || cp ../deploy/relay.env.production.example .env
bash ../deploy/make-secrets.sh    # copies RELAY_SECRET from backend/.env
nano .env      # replace DOMAIN
npm ci --omit=dev
```

## 9. Web server rules (CloudPanel)

**The API site** (`DOMAIN`):

1. CloudPanel → the `DOMAIN` site → **Vhost**.
2. The Vhost has two `server { ... }` blocks. In the **first** one (with `listen 443`):
   - delete the `location / { {{varnish_proxy_pass}} ... }` block,
   - delete the static-files block that starts with `location ~* ^.+\.(css|js|jpg|...`,
   - paste the contents of [`deploy/nginx-locations.conf`](deploy/nginx-locations.conf) in their place.
   Leave the second block (`listen 8080`, CloudPanel's Varnish backend) exactly as it is.
3. **Save**. CloudPanel refuses to save if there's a mistake, and tells you the line.

**The app site** (`APP_DOMAIN`):

1. CloudPanel → the `APP_DOMAIN` site → **Vhost**: replace everything with the contents of
   [`deploy/nginx-app.conf`](deploy/nginx-app.conf).
2. Replace `APP_DOMAIN`, `SITE_USER` (the API site's user) and `DOMAIN`, then **Save**.

## 10. Keep Reverb and the relay running (as root)

```bash
exit     # back to root, if you're still the site user
cp /home/SITE_USER/htdocs/DOMAIN/deploy/supervisor/*.conf /etc/supervisor/conf.d/
nano /etc/supervisor/conf.d/negosyowork-reverb.conf   # replace SITE_USER and DOMAIN
nano /etc/supervisor/conf.d/negosyowork-relay.conf    # replace SITE_USER, DOMAIN and the Node path (step 5)
supervisorctl reread && supervisorctl update
supervisorctl status
```

Both `negosyowork-reverb` and `negosyowork-relay` should say **RUNNING**. They start again by
themselves after a crash or a reboot.

## 11. Scheduled tasks (CloudPanel)

Your site → **Cron Jobs** → **Add Cron Job**: every minute (`* * * * *`), command:

```
/usr/bin/php8.4 /home/SITE_USER/htdocs/DOMAIN/backend/artisan schedule:run >> /dev/null 2>&1
```

## 12. Check that everything works

1. Open `https://APP_DOMAIN` and log in with your superadmin email and password.
2. **Payments** → **Payment methods**: add your GCash, Maya or bank account. Then sign up a
   test seller in a private window: their **Plan** page shows the free week, and paying for a
   plan sends the receipt to your **Payments** page to approve.
3. Open a setup → turn on the camera → tap a popup: it should appear on the clean screen at once
   (that's Reverb working).
4. **Go live → Stream straight**: save a stream key and start a short test live.

## Updating later

On your computer: commit and `git push`. On the server, as the site user:

```bash
cd ~/htdocs/DOMAIN && bash deploy/deploy.sh
```

Then as root: `supervisorctl restart negosyowork-reverb negosyowork-relay`.

## If something goes wrong

| What you see | Where to look / what to do |
|---|---|
| Blank page or 404 on the app | Step 9 (app site): check the paths (`SITE_USER`, `DOMAIN`) and that `frontend/dist` exists (step 7). |
| "Network error" on login | `frontend/.env`: `VITE_API_URL=https://DOMAIN`, then `npm run build`. `backend/.env`: `FRONTEND_URL=https://APP_DOMAIN`, then `php8.4 artisan config:cache`. |
| "Server error" (500) | `tail -50 ~/htdocs/DOMAIN/backend/storage/logs/laravel-*.log` (as the site user). After editing `.env`, run `php8.4 artisan config:cache`. |
| Logged out right after logging in | `backend/.env`: `SESSION_DOMAIN=.PARENT_DOMAIN` (with the dot), `SANCTUM_STATEFUL_DOMAINS=APP_DOMAIN`, then `php8.4 artisan config:cache`. |
| Popups take a second to show | Reverb isn't reached: `supervisorctl status`; `VITE_REVERB_APP_KEY` = `REVERB_APP_KEY` and `VITE_REVERB_HOST=DOMAIN` (rebuild the frontend after changing it); `REVERB_ALLOWED_ORIGINS=APP_DOMAIN`. |
| "Can't reach the streaming relay" | `supervisorctl status negosyowork-relay`; log: `/home/SITE_USER/logs/negosyowork-relay.log`. |
| Emails don't arrive | `.env` SMTP settings, then `php8.4 artisan config:cache`. |

How much the VPS can handle: the website, camera effects and OBS / TikTok LIVE Studio use very
little (the work happens in each seller's browser). **Streaming straight** re-encodes video on
the VPS: about one CPU core per live, so KVM 2 handles about two at the same time.
