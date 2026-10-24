#!/usr/bin/env bash
# NegosyoWork Studio: add the settings that are new in deploy/*.env.production.example to this
# copy's .env files. Run as the site user, after updating the code:
#   bash deploy/sync-env.sh            add the missing settings
#   bash deploy/sync-env.sh --check    only list them (deploy.sh does this on every update)
# It never changes or removes a line already in a .env file: each missing setting is added at
# the end, with the template's value and the comment above it. Values the template leaves as
# CHANGE_ME or a DOMAIN placeholder are listed so you can fill them in.
set -euo pipefail

cd "$(dirname "$0")/.."

check_only=false
[ "${1:-}" = "--check" ] && check_only=true

# Prints each setting of the template ($1) that the .env file ($2) doesn't have, with the
# comment lines directly above it in the template.
missing_settings() {
  awk -F= '
    NR == FNR { if ($0 ~ /^[A-Za-z_][A-Za-z0-9_]*=/) have[$1] = 1; next }
    /^#/ { notes = notes $0 "\n"; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ { if (!($1 in have)) printf "%s%s\n", notes, $0; notes = ""; next }
    { notes = "" }
  ' "$2" "$1"
}

changed=false
for part in backend frontend relay; do
  template="deploy/$part.env.production.example"
  env="$part/.env"
  [ -f "$env" ] || { echo "  skipped $env (not created yet)"; continue; }

  block="$(missing_settings "$template" "$env")"
  [ -n "$block" ] || continue
  keys="$(printf '%s\n' "$block" | grep -v '^#' | cut -d= -f1 | tr '\n' ' ')"
  changed=true

  if $check_only; then
    echo "  $env is missing: $keys"
    continue
  fi

  # Start on a new line even if the file doesn't end with one.
  [ -z "$(tail -c1 "$env")" ] || echo >> "$env"
  printf '\n# Added by deploy/sync-env.sh on %s\n%s\n' "$(date +%F)" "$block" >> "$env"
  echo "  added to $env: $keys"

  placeholders="$(printf '%s\n' "$block" | grep -v '^#' | grep -E '=.*(CHANGE_ME|DOMAIN)' | cut -d= -f1 | tr '\n' ' ' || true)"
  [ -z "$placeholders" ] || echo "  FILL IN in $env (nano $env): $placeholders" >&2
done

if ! $changed; then
  echo "  every .env file has all the settings from deploy/"
elif $check_only; then
  echo "  To add them (existing values are kept): bash deploy/sync-env.sh"
else
  echo "Done. Then: php8.4 artisan config:cache (backend), npm run build (frontend),"
  echo "and as root: supervisorctl restart negosyowork-reverb negosyowork-relay"
fi
