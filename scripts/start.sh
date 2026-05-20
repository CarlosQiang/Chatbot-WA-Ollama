#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Helper: lee variable del .env sin sourcearlo (evita errores con valores con espacios)
get_env() {
  local key=$1
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//'
}

# 1) Asegurar .env
if [ ! -f .env ]; then
  echo "→ Creando .env desde .env.example"
  cp .env.example .env
  echo ""
  echo "⚠️  Edita .env y configura al menos:"
  echo "    OPENWA_API_KEY=<tu_api_key_de_openwa>"
  echo ""
  echo "Luego vuelve a ejecutar: ./scripts/start.sh"
  exit 1
fi

# 2) Validar variables críticas (sin source para evitar problemas)
OPENWA_API_KEY=$(get_env OPENWA_API_KEY)
if [ -z "$OPENWA_API_KEY" ] || [ "$OPENWA_API_KEY" = "CAMBIAR_POR_TU_API_KEY" ]; then
  echo "❌ Falta OPENWA_API_KEY en .env"
  exit 1
fi

FRONTEND_PORT=$(get_env FRONTEND_PORT)
BACKEND_PORT=$(get_env BACKEND_PORT)
POSTGRES_PORT=$(get_env POSTGRES_PORT)
REDIS_PORT=$(get_env REDIS_PORT)

# 3) Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker no instalado"
  exit 1
fi

# 4) Avisar de colisión de puertos
for p in $FRONTEND_PORT $BACKEND_PORT $POSTGRES_PORT $REDIS_PORT; do
  if (command -v ss &>/dev/null && ss -tln 2>/dev/null | awk '{print $4}' | grep -E ":${p}$" >/dev/null) || \
     (command -v netstat &>/dev/null && netstat -tln 2>/dev/null | awk '{print $4}' | grep -E ":${p}$" >/dev/null); then
    echo "⚠️  Puerto $p ya en uso. Revisa colisiones."
  fi
done

echo "→ Construyendo y arrancando contenedores…"
docker compose up -d --build

echo ""
echo "✅ Stack arrancado"
echo "   Dashboard: http://localhost:${FRONTEND_PORT}"
echo "   API:       http://localhost:${BACKEND_PORT}/api  (Swagger)"
echo "   Health:    http://localhost:${BACKEND_PORT}/health"
echo ""
echo "Siguiente paso recomendado:"
echo "   ./scripts/register-webhook.sh    # registrar webhook en OpenWA"
echo "   ./scripts/check.sh               # comprobar estado"
echo ""
echo "Logs en vivo:  docker compose logs -f backend"
echo "Detener:       ./scripts/stop.sh"
