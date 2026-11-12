#!/usr/bin/env bash
set -Eeuo pipefail

PACKAGE=/tmp/mysic-backend-20261112-stream-head-prefetch.tar.gz
PACKAGE_SHA=8e864b0fdfa9317910c000ecc3d9baf90c66e927a44a9e5208592a67c37f9920
BACKEND=/srv/mysic/Backend
RELEASES=/srv/mysic/releases
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$RELEASES/pre-stream-head-prefetch-$STAMP"
WORK="$(mktemp -d /tmp/mysic-stream-deploy.XXXXXX)"
CHANGED=0

FILES=(
  src/youtube/routes/stream.mjs
  src/youtube/youtube/stream.mjs
  src/youtube/routes/stream.test.mjs
  src/youtube/youtube/stream.test.mjs
)

rollback() {
  local exit_code=$?
  if [[ "$CHANGED" == 1 ]]; then
    echo "Deployment failed; restoring $BACKUP" >&2
    for file in "${FILES[@]}"; do
      install -o ubuntu -g ubuntu -m 0644 "$BACKUP/Backend/$file" "$BACKEND/$file"
    done
    systemctl restart mysic-api || true
  fi
  rm -rf -- "$WORK"
  exit "$exit_code"
}
trap rollback ERR INT TERM

[[ "$(id -u)" == 0 ]] || { echo 'Run this script with sudo.' >&2; exit 1; }
[[ -f "$PACKAGE" ]] || { echo "Missing $PACKAGE" >&2; exit 1; }
echo "$PACKAGE_SHA  $PACKAGE" | sha256sum --check --status

cd "$BACKEND"
cat >"$WORK/production-before.sha256" <<'HASHES'
502674e5c89d4019b97d74621404ab2cc7b8ce55ecafe4c708843838743da5e3  src/youtube/routes/stream.mjs
a09867e7d6594d13c19b419a76f85131710406ce0eee88a3dbfca1b6ac3c058b  src/youtube/youtube/stream.mjs
28661f947e74ea2fd6e455d618e96f9e4f41b89fa2d337193141396c2d946d34  src/youtube/routes/stream.test.mjs
d1603bed9c54df6ea2aaf45826a57171285a26bc268a770737d8167cc50b5050  src/youtube/youtube/stream.test.mjs
HASHES
sha256sum --check --status "$WORK/production-before.sha256" || {
  echo 'Production no longer matches the verified 2026-11-11 baseline; aborting without changes.' >&2
  exit 1
}

tar -xzf "$PACKAGE" -C "$WORK"
cd "$WORK"
sha256sum --check --status MANIFEST.sha256
grep -Fq 'getYoutubeForUser' Backend/src/youtube/routes/stream.mjs
grep -Fq 'user:${req.mysicUser._id}' Backend/src/youtube/routes/stream.mjs

for file in "${FILES[@]}"; do
  install -D -o ubuntu -g ubuntu -m 0644 "$BACKEND/$file" "$BACKUP/Backend/$file"
done

CHANGED=1
for file in "${FILES[@]}"; do
  install -o ubuntu -g ubuntu -m 0644 "$WORK/Backend/$file" "$BACKEND/$file"
done

cd /srv/mysic
sha256sum --check --status "$WORK/MANIFEST.sha256"
cd "$BACKEND"
sudo -u ubuntu -H npm run check
systemctl restart mysic-api

for _ in {1..20}; do
  systemctl is-active --quiet mysic-api && break
  sleep 1
done
systemctl is-active --quiet mysic-api

READY=0
for _ in {1..30}; do
  if curl --fail --silent --show-error https://myslc.duckdns.org/api/health >/dev/null \
    && curl --fail --silent --show-error https://myslc.duckdns.org/api/youtube/health >/dev/null; then
    READY=1
    break
  fi
  sleep 2
done
[[ "$READY" == 1 ]]

info_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  https://myslc.duckdns.org/api/youtube/stream/dQw4w9WgXcQ/info)"
stream_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  -H 'Range: bytes=0-' https://myslc.duckdns.org/api/youtube/stream/dQw4w9WgXcQ)"
[[ "$info_code" == 401 && "$stream_code" == 401 ]]

CHANGED=0
trap - ERR INT TERM
rm -rf -- "$WORK"
echo "DEPLOY_OK"
echo "BACKUP=$BACKUP"
systemctl show mysic-api -p MainPID -p MemoryCurrent -p CPUUsageNSec --no-pager
