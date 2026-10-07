#!/usr/bin/env bash
set -euo pipefail

before=${1:?Manca il commit iniziale}
after=${2:?Manca il commit finale}

# Un ramo appena creato non ha un commit iniziale: confronta con l'albero vuoto.
if [[ "$before" =~ ^0+$ ]]; then
  before=$(git hash-object -t tree /dev/null)
else
  git cat-file -e "$before^{commit}"
fi
git cat-file -e "$after^{commit}"

# Conserva i filtri dei vecchi workflow push. --no-renames include sia il
# vecchio sia il nuovo percorso; -z gestisce anche nomi con spazi e newline.
changed_files=$(mktemp)
trap 'rm -f "$changed_files"' EXIT
git diff --name-only --no-renames -z "$before" "$after" > "$changed_files"
backend=false
dashboard=false
landing=false
caddy=false
while IFS= read -r -d '' path; do
  case "$path" in
    backend/*|docker-compose.yml|.github/workflows/deploy-backend.yml) backend=true ;;
  esac
  case "$path" in
    dashboard/*|Dockerfile.dashboard|.github/workflows/deploy-dashboard.yml) dashboard=true ;;
  esac
  case "$path" in
    landing/*|Dockerfile.landing|.github/workflows/deploy-landing.yml) landing=true ;;
  esac
  case "$path" in
    Caddyfile|Dockerfile.caddy|.github/workflows/deploy-caddy.yml) caddy=true ;;
  esac
done < "$changed_files"
printf 'backend=%s\ndashboard=%s\nlanding=%s\ncaddy=%s\n' "$backend" "$dashboard" "$landing" "$caddy"
