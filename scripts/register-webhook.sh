#!/usr/bin/env bash
# Registra el backend como webhook en OpenWA con los eventos correctos.
# Limpia primero cualquier webhook anterior con la misma URL.
set -e
cd "$(dirname "$0")/.."

get_env() {
  grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

BACKEND_PORT=$(get_env BACKEND_PORT)

# Llama a nuestro endpoint que internamente borra duplicados y registra
# con los eventos correctos (message.received + message.sent).
curl -s -X POST "http://localhost:${BACKEND_PORT}/openwa/webhooks/register" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool || true
