#!/usr/bin/env bash
set -euo pipefail
archive="${1:?Expected an uploaded release archive}"
release=$(mktemp -d /opt/property-portal/releases/api.XXXXXXXX)
trap 'rm -f "$archive"' EXIT
tar -xzf "$archive" --no-same-owner -C "$release"
cd "$release"
export DATABASE_URL=file:/var/lib/property-portal/property.db
npm ci --include=dev --no-audit --no-fund
npm run prisma:generate
npm run build
npx --no-install prisma migrate deploy
ln -s "$release" /opt/property-portal/api.next
mv -Tf /opt/property-portal/api.next /opt/property-portal/api
sudo -n /usr/bin/systemctl restart property-portal-api
curl --fail --silent --show-error --retry 15 --retry-all-errors --retry-delay 1 --retry-max-time 60 --max-time 5 http://127.0.0.1:4000/health
printf '\nAPI release deployed: %s\n' "$release"
