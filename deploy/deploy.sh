#!/usr/bin/env bash
# NegosyoWork Studio: update the live site to the latest code on GitHub.
# Run as the CloudPanel SITE USER (not root), from the project folder:
#   cd ~/htdocs/DOMAIN && bash deploy/deploy.sh
# Afterwards, as root:  supervisorctl restart negosyowork-reverb negosyowork-relay
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PHP="${PHP:-php8.4}"
# Composer runs on the same PHP as the site (the server's default `php` may be older).
COMPOSER=("$PHP" "$(command -v composer)")

echo "==> Getting the latest code"
git pull --ff-only

echo "==> Settings"
# Only lists settings that are new in deploy/; adding them is a separate, deliberate step.
bash deploy/sync-env.sh --check

echo "==> Backend"
cd "$ROOT/backend"
"$PHP" artisan down --retry=15 || true
"${COMPOSER[@]}" install --no-dev --optimize-autoloader --no-interaction
"$PHP" artisan migrate --force
"$PHP" artisan storage:link 2>/dev/null || true
"$PHP" artisan config:cache
"$PHP" artisan route:cache
"$PHP" artisan event:cache
"$PHP" artisan up

echo "==> Frontend"
cd "$ROOT/frontend"
npm ci
npm run build

echo "==> Relay"
cd "$ROOT/relay"
npm ci --omit=dev

echo
echo "Done. Now, as root, restart the background programs so they run the new code:"
echo "  supervisorctl restart negosyowork-reverb negosyowork-relay"
