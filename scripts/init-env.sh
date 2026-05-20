#!/usr/bin/env bash
# ====================================================================
# init-env.sh — genera un .env completo y funcional con tus credenciales
# ====================================================================
# Uso: bash scripts/init-env.sh
# Hace:
#   - Genera secrets aleatorios para POSTGRES_PASSWORD, BACKEND_API_KEY,
#     WEBHOOK_SECRET y JWT_SECRET (no tendrás que pensarlos).
#   - Si ya existe un .env, reutiliza tus valores actuales como default.
#   - Te pide la OPENWA_API_KEY y opcionalmente Telegram.
# ====================================================================

set -e
cd "$(dirname "$0")/.."

ENV_FILE=".env"
TEMPLATE=".env.example"

if [ ! -f "$TEMPLATE" ]; then
  echo "❌ No encuentro .env.example"
  exit 1
fi

# Funcion para leer un valor del .env actual o usar default
read_existing() {
  local key="$1"
  local default="$2"
  if [ -f "$ENV_FILE" ]; then
    local current
    current=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2-)
    if [ -n "$current" ]; then echo "$current"; return; fi
  fi
  echo "$default"
}

# Backup del .env actual si existe
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d-%H%M%S)"
  echo "📁 Backup del .env actual guardado"
fi

# Generar o reusar secrets
gen() { openssl rand -hex "$1"; }
POSTGRES_PASSWORD=$(read_existing "POSTGRES_PASSWORD" "$(gen 16)")
BACKEND_API_KEY=$(read_existing "BACKEND_API_KEY" "$(gen 32)")
WEBHOOK_SECRET=$(read_existing "WEBHOOK_SECRET" "$(gen 32)")
JWT_SECRET=$(read_existing "JWT_SECRET" "$(gen 48)")

# Si el BACKEND_API_KEY es el sentinela, regenerarlo
if [ "$BACKEND_API_KEY" = "internal_change_me_token" ]; then
  BACKEND_API_KEY=$(gen 32)
fi
if [ "$WEBHOOK_SECRET" = "webhook_secret_change_me" ]; then
  WEBHOOK_SECRET=$(gen 32)
fi

# Datos fijos del usuario
OPENWA_API_URL=$(read_existing "OPENWA_API_URL" "http://192.168.8.200:2785/api")
OPENWA_SESSION_ID=$(read_existing "OPENWA_SESSION_ID" "6d50d269-5457-46d0-be01-700ed73ae044")
OPENWA_SESSION_NAME=$(read_existing "OPENWA_SESSION_NAME" "bot-prueba")
OPENWA_SESSION_PHONE=$(read_existing "OPENWA_SESSION_PHONE" "34670209033")
OLLAMA_BASE_URL=$(read_existing "OLLAMA_BASE_URL" "http://host.docker.internal:11434")
OLLAMA_FALLBACK_URLS=$(read_existing "OLLAMA_FALLBACK_URLS" "http://192.168.8.200:11434")
OLLAMA_DEFAULT_MODEL=$(read_existing "OLLAMA_DEFAULT_MODEL" "llama3.2:1b")
TEST_WHATSAPP_CHAT_ID=$(read_existing "TEST_WHATSAPP_CHAT_ID" "34670209033@c.us")

# Pedir lo que es secreto al usuario
OPENWA_API_KEY=$(read_existing "OPENWA_API_KEY" "")
if [ -z "$OPENWA_API_KEY" ] || [ "$OPENWA_API_KEY" = "CAMBIAR_POR_TU_API_KEY" ]; then
  echo ""
  echo "👉 Pega tu OPENWA_API_KEY (sacala con: docker exec openwa-api printenv | grep -i key)"
  read -r OPENWA_API_KEY
fi

TELEGRAM_BOT_TOKEN=$(read_existing "TELEGRAM_BOT_TOKEN" "")
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo ""
  echo "👉 Telegram Bot Token (opcional, deja vacio si no lo tienes aun)"
  echo "   Se obtiene en @BotFather: /newbot → te da el token"
  read -r TELEGRAM_BOT_TOKEN
fi

TELEGRAM_ALLOWED_USER_IDS=$(read_existing "TELEGRAM_ALLOWED_USER_IDS" "")
if [ -z "$TELEGRAM_ALLOWED_USER_IDS" ] && [ -n "$TELEGRAM_BOT_TOKEN" ]; then
  echo ""
  echo "👉 Tu Telegram User ID (opcional, deja vacio para permitir a cualquiera)"
  echo "   Lo descubres con: /quien al bot, o https://api.telegram.org/bot<TOKEN>/getUpdates"
  read -r TELEGRAM_ALLOWED_USER_IDS
fi

# Escribir .env
cat > "$ENV_FILE" << ENVEOF
# Generado por scripts/init-env.sh el $(date)
FRONTEND_PORT=3410
BACKEND_PORT=3411
POSTGRES_PORT=5438
REDIS_PORT=6385

POSTGRES_USER=hubuser
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=local_ai_hub
DATABASE_URL=postgresql://hubuser:${POSTGRES_PASSWORD}@local-ai-hub-postgres:5432/local_ai_hub?schema=public

REDIS_URL=redis://local-ai-hub-redis:6379

OPENWA_API_URL=${OPENWA_API_URL}
OPENWA_API_KEY=${OPENWA_API_KEY}
OPENWA_SESSION_ID=${OPENWA_SESSION_ID}
OPENWA_SESSION_NAME=${OPENWA_SESSION_NAME}
OPENWA_SESSION_PHONE=${OPENWA_SESSION_PHONE}

OLLAMA_BASE_URL=${OLLAMA_BASE_URL}
OLLAMA_FALLBACK_URLS=${OLLAMA_FALLBACK_URLS}
OLLAMA_DEFAULT_MODEL=${OLLAMA_DEFAULT_MODEL}
OLLAMA_TIMEOUT_MS=120000

NODE_ENV=production
BACKEND_INTERNAL_PORT=3411
BACKEND_PUBLIC_URL=http://192.168.8.200:3411
BACKEND_API_KEY=${BACKEND_API_KEY}
JWT_SECRET=${JWT_SECRET}
CORS_ORIGIN=http://192.168.8.200:3410,http://localhost:3410
LOG_LEVEL=info
TZ=Europe/Madrid
REMINDER_TZ=Europe/Madrid

WEBHOOK_URL=http://192.168.8.200:3411/webhooks/openwa
WEBHOOK_SECRET=${WEBHOOK_SECRET}

NEXT_PUBLIC_API_URL=http://192.168.8.200:3411
NEXT_PUBLIC_WS_URL=ws://192.168.8.200:3411
NEXT_PUBLIC_APP_NAME="Local AI Hub"

CHAT_CONTEXT_MAX_MESSAGES=20
CHAT_SYSTEM_PROMPT="Eres un asistente util, conciso y directo. Respondes siempre en español a menos que el usuario hable en otro idioma."

BOT_MODE_DEFAULT=private
OPEN_TO_ALL=false

TEST_WHATSAPP_CHAT_ID=${TEST_WHATSAPP_CHAT_ID}
ALLOWED_CHAT_IDS=
ADMIN_CHAT_IDS=

POLL_ENABLED=true
POLL_INTERVAL_MS=5000

TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_USER_IDS=${TELEGRAM_ALLOWED_USER_IDS}
TELEGRAM_POLL_INTERVAL_MS=2000
ENVEOF

echo ""
echo "✅ .env generado correctamente"
echo ""
echo "Resumen:"
echo "  POSTGRES_PASSWORD     : (generado/reutilizado)"
echo "  BACKEND_API_KEY       : ${BACKEND_API_KEY:0:8}..."
echo "  WEBHOOK_SECRET        : ${WEBHOOK_SECRET:0:8}..."
echo "  JWT_SECRET            : (generado)"
echo "  OPENWA_API_KEY        : ${OPENWA_API_KEY:0:12}..."
echo "  OPENWA_SESSION_PHONE  : ${OPENWA_SESSION_PHONE}"
echo "  OLLAMA_FALLBACK_URLS  : ${OLLAMA_FALLBACK_URLS}"
echo "  TELEGRAM_BOT_TOKEN    : ${TELEGRAM_BOT_TOKEN:-(vacio)}"
echo "  TELEGRAM_ALLOWED_IDS  : ${TELEGRAM_ALLOWED_USER_IDS:-(vacio)}"
echo ""
echo "Próximos pasos:"
echo "  docker compose build"
echo "  docker compose up -d"
echo "  docker compose logs -f backend"
