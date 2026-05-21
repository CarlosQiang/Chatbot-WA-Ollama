# Despliegue — Chatbot-WA en 192.168.8.200

Guía exacta para arrancar el proyecto desde cero sin errores.

## Pre-requisitos en el servidor (192.168.8.200)

- Docker + Docker Compose v2 instalado
- OpenWA corriendo en :2785 y :2887 con la sesion `chatbot-wa` ya escaneada y `Connected`
- Ollama corriendo en :11434 (host o LAN)

## 1. Subir el código al servidor

Desde tu equipo:

```bash
# si aún no está en GitHub, opción rápida:
scp -r ./Chatbot-WA usuario@192.168.8.200:/opt/chatbot-wa

# o si ya está en GitHub:
ssh usuario@192.168.8.200
git clone https://github.com/TU_USUARIO/Chatbot-WA.git /opt/chatbot-wa
```

> El `.env` que generé tiene tus secretos. Sube el repo, sube tu `.env` aparte (no está en git porque `.gitignore` lo protege), o vuelve a generarlo en el servidor con `bash scripts/init-env.sh`.

## 2. Conectarse al servidor y arrancar

```bash
ssh usuario@192.168.8.200
cd /opt/chatbot-wa

# Si NO has subido el .env: genéralo con autodetección de Session UUID.
bash scripts/init-env.sh

# Arranca todo (Docker, build, registra webhook automáticamente):
bash scripts/start.sh
```

`start.sh` ahora hace en orden:

1. Detecta si `OPENWA_SESSION_ID` está sin rellenar → llama a `init-env.sh` que pregunta a la API de OpenWA y lo escribe solo.
2. `docker compose up -d --build` (postgres, redis, backend, frontend).
3. Espera al healthcheck del backend.
4. Llama a `register-webhook.sh` para suscribir el backend a `message.received` y `message.sent` en OpenWA.

## 3. Verificar

```bash
bash scripts/check.sh
docker compose logs -f backend
```

Endpoints:

- Dashboard:  http://192.168.8.200:3410
- Swagger:    http://192.168.8.200:3411/api
- Health:     http://192.168.8.200:3411/health

## 4. Configuración desde el dashboard (no hace falta tocar .env)

Abre http://192.168.8.200:3410 → Ajustes:

- **Mi WhatsApp personal**: 612345678 (o el formato que sea — el sistema normaliza). Aquí llegan TODOS los recordatorios y notas IA.
- **Whitelist**: lista de números que pueden hablar con el bot. Multi-número, mismo normalizador.
- **Auto-IA**: lista de números que reciben respuesta automática con Ollama.
- **Ollama**: URL del servidor Ollama si no es `host.docker.internal`.
- **Telegram bot token**: pégalo aquí para activar el control panel sin tocar `.env`.

## 5. Probar el flujo completo

Desde Telegram al bot:

| Comando | Qué pasa |
|--------|----------|
| `/recordar en 2 minutos probar bot` | Crea reminder → llega a tu WhatsApp en 2 min |
| `/organiza voy al super, leche pan huevos, tambien dentista jueves` | Ollama lo reorganiza → llega como nota limpia a tu WhatsApp |
| `/wa hola desde Telegram` | Envía "hola desde Telegram" a tu WhatsApp |
| `/estado` | Estado de backend, OpenWA, Ollama (responde en Telegram) |

Desde WhatsApp al bot:
- Cualquier mensaje normal → Ollama responde.
- Comandos `/estado`, `/modelos`, `/reset`, etc.

## 6. Resolver problemas comunes

**El bot no responde a tus mensajes de WhatsApp**

```bash
docker compose logs -f backend | grep ingest
```

- Si ves `not_allowed`: añade tu número en Ajustes → Whitelist.
- Si ves `bot_silent` o `bot_maintenance`: cambia modo a `private` o `ai` en Ajustes.
- Si no ves nada: el webhook no llega. `bash scripts/register-webhook.sh` lo registra. El polling cada 5s es fallback.

**Los chats no aparecen en el dashboard**

Mira que el WebSocket conecta:

```bash
docker compose logs frontend | grep WS
docker compose logs backend | grep realtime
```

**Build de Prisma falla**

```bash
docker compose build --no-cache backend
```

**OpenWA cambió de Session UUID**

```bash
# Borra el actual del .env y vuelve a autodetectar:
sed -i 's/^OPENWA_SESSION_ID=.*/OPENWA_SESSION_ID=/' .env
bash scripts/init-env.sh
docker compose restart backend
bash scripts/register-webhook.sh
```

## 7. Parar / reiniciar

```bash
bash scripts/stop.sh                 # parar todo
docker compose restart backend       # reiniciar solo backend
docker compose down -v               # parar y borrar volumenes (RESET TOTAL)
```
