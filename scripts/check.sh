#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Lee env vars sin source (seguro con valores que tienen espacios)
get_env() {
  grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

BACKEND_PORT=$(get_env BACKEND_PORT)
FRONTEND_PORT=$(get_env FRONTEND_PORT)
OPENWA_API_URL=$(get_env OPENWA_API_URL)
OLLAMA_BASE_URL=$(get_env OLLAMA_BASE_URL)

ok="✅"
err="❌"

check() {
  local name=$1
  local url=$2
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    echo "$ok $name → $url"
  else
    echo "$err $name → $url"
    return 1
  fi
}

echo "==> Verificando stack local-ai-hub"
echo ""

# Contenedores
echo "Contenedores:"
docker ps --filter "name=local-ai-hub-" --format "  {{.Names}}\t{{.Status}}" || true
echo ""

# Servicios HTTP
echo "Servicios locales:"
check "Backend health" "http://localhost:${BACKEND_PORT}/health" || true
check "Backend swagger" "http://localhost:${BACKEND_PORT}/api" || true
check "Frontend dashboard" "http://localhost:${FRONTEND_PORT}" || true
echo ""

# OpenWA y Ollama externos
echo "Servicios externos:"
check "OpenWA API" "${OPENWA_API_URL}/health" || true
OLLAMA_HOST="${OLLAMA_BASE_URL/host.docker.internal/localhost}"
check "Ollama" "${OLLAMA_HOST}/api/tags" || true
echo ""

# Detalle del backend
echo "Estado backend completo:"
curl -s "http://localhost:${BACKEND_PORT}/health" 2>/dev/null | python3 -m json.tool || echo "(no disponible)"
