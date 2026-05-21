#!/usr/bin/env bash
# Registra el backend como webhook en OpenWA con los eventos correctos.
# Limpia primero cualquier webhook anterior con la misma URL.
set -e
cd "$(dirname "$0")/.."

get_env() {
  grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

BACKEND_PORT=$(get_env BACKEND_PORT)
BACKEND_API_KEY=$(get_env BACKEND_API_KEY)

if [ -z "$BACKEND_API_KEY" ] || [ "$BACKEND_API_KEY" = "internal_change_me_token" ]; then
  echo "❌ BACKEND_API_KEY no configurada en .env"
  exit 1
fi

# Llama a nuestro endpoint que internamente borra duplicados y registra
# con los eventos correctos (message.received).
echo "==> Registrando webhook en OpenWA..."
curl -s -X POST "http://localhost:${BACKEND_PORT}/openwa/webhooks/register" \
  -H "x-api-key: ${BACKEND_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool || true
