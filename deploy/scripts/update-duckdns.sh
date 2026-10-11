#!/usr/bin/env bash
set -euo pipefail

: "${DUCKDNS_DOMAIN:?Falta DUCKDNS_DOMAIN}"
: "${DUCKDNS_TOKEN:?Falta DUCKDNS_TOKEN}"

response="$(curl --fail --silent --show-error \
  "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")"

if [[ "$response" != "OK" ]]; then
  echo "DuckDNS respondió: $response" >&2
  exit 1
fi

