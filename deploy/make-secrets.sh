#!/usr/bin/env bash
# NegosyoWork Studio: create this copy's own Reverb and relay secrets.
# Run as the site user, in each copy (production and development each get different keys):
#   bash deploy/make-secrets.sh
# It writes the secrets straight into backend/.env, frontend/.env and relay/.env (never
# printing them) and only fills values still set to CHANGE_ME, so running it again is safe:
# it never replaces keys that are already working.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f backend/.env ]; then
  echo "backend/.env is missing: create it from deploy/backend.env.production.example first (DEPLOY.md step 6)." >&2
  exit 1
fi

# Sets KEY=value in a file, but only where the line still says CHANGE_ME.
fill() {
  local file="$1" key="$2" value="$3"
  [ -f "$file" ] || { echo "  skipped $file (not created yet)"; return; }
  if grep -q "^${key}=CHANGE_ME[[:space:]]*$" "$file"; then
    sed -i "s|^${key}=CHANGE_ME[[:space:]]*$|${key}=${value}|" "$file"
    echo "  set $key in $file"
  fi
}

current() { grep -m1 "^$1=" "$2" 2>/dev/null | cut -d= -f2- || true; }

fill backend/.env REVERB_APP_ID "$(shuf -i 100000-999999 -n 1)"
fill backend/.env REVERB_APP_KEY "$(openssl rand -hex 10)"
fill backend/.env REVERB_APP_SECRET "$(openssl rand -hex 20)"
fill backend/.env RELAY_SECRET "$(openssl rand -hex 32)"

# The browser and the relay must use the same values as the backend.
fill frontend/.env VITE_REVERB_APP_KEY "$(current REVERB_APP_KEY backend/.env)"
fill relay/.env RELAY_SECRET "$(current RELAY_SECRET backend/.env)"

if [ -f frontend/.env ] && [ "$(current VITE_REVERB_APP_KEY frontend/.env)" != "$(current REVERB_APP_KEY backend/.env)" ]; then
  echo "WARNING: VITE_REVERB_APP_KEY in frontend/.env differs from REVERB_APP_KEY in backend/.env." >&2
fi
if [ -f relay/.env ] && [ "$(current RELAY_SECRET relay/.env)" != "$(current RELAY_SECRET backend/.env)" ]; then
  echo "WARNING: RELAY_SECRET in relay/.env differs from backend/.env." >&2
fi

echo "Done. Then: php8.4 artisan config:cache (backend), npm run build (frontend),"
echo "and as root: supervisorctl restart negosyowork-reverb negosyowork-relay"
