# Despliegue — Local AI Hub

Guia rapida para arrancar el proyecto tras la revision completa.

## 0. Limpiar archivos temporales

Antes de subir el repo (quedaron de la verificacion de tipos):

```bash
rm backend/tsconfig-check.json   # Linux/Mac
del backend\tsconfig-check.json  # Windows
```

## 1. Configurar `.env`

```bash
cp .env.example .env
```

**Valores que TIENES que cambiar (criticos):**

| Variable | Por que |
|---|---|
| `POSTGRES_PASSWORD` | Pon algo aleatorio |
| `BACKEND_API_KEY` | Si la dejas como `internal_change_me_token` el backend solo acepta loopback. Pon un token real |
| `WEBHOOK_SECRET` | Igual: con sentinela los webhooks remotos se rechazan. Pon un secret real |
| `JWT_SECRET` | String largo aleatorio |
| `OPENWA_API_KEY` | Tu API key real de OpenWA |
| `OPENWA_SESSION_ID` | ID de tu sesion OpenWA |
| `OPENWA_SESSION_PHONE` | Tu numero (sin +). Sera admin automaticamente |

**Variables nuevas utiles:**

| Variable | Default | Para que |
|---|---|---|
| `TZ` | `Europe/Madrid` | Zona horaria del contenedor |
| `REMINDER_TZ` | `Europe/Madrid` | Zona horaria de recordatorios |
| `BOT_MODE_DEFAULT` | `private` | manual / private / ai / silent / maintenance |
| `OPEN_TO_ALL` | `false` | Si `true`, responde a todos (no recomendado) |
| `OLLAMA_FALLBACK_URLS` | (vacio) | URLs Ollama de fallback, coma-separadas |
| `ADMIN_CHAT_IDS` | (vacio) | Admins extra. Tu numero ya es admin automaticamente |

**Generar secrets seguros:**

Linux/Mac:
```bash
openssl rand -hex 32
```

Windows PowerShell:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}))
```

## 2. Configurar webhook en OpenWA

OpenWA debe enviar el `WEBHOOK_SECRET`. Tres opciones (elige la que soporte tu OpenWA):

**A) Header (recomendada):**
```bash
curl -X POST \
  -H "x-api-key: $OPENWA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url":"http://192.168.8.200:3411/webhooks/openwa",
    "events":["message.received","message.sent"],
    "headers":{"x-webhook-secret":"TU_WEBHOOK_SECRET"}
  }' \
  http://192.168.8.200:2785/api/sessions/$OPENWA_SESSION_ID/webhooks
```

**B) Query param:**
URL: `http://192.168.8.200:3411/webhooks/openwa?token=TU_WEBHOOK_SECRET`

**C) Path:**
URL: `http://192.168.8.200:3411/webhooks/openwa/TU_WEBHOOK_SECRET`

## 3. Construir y arrancar

```bash
docker compose build
docker compose up -d
docker compose logs -f backend
```

La primera vez:
1. Crea la BD Postgres
2. Aplica migraciones Prisma
3. Arranca backend (3411) y frontend (3410)

## 4. Verificar

```bash
# Backend
curl http://localhost:3411/health

# Settings (necesita API key si no es loopback)
curl -H "x-api-key: TU_BACKEND_API_KEY" http://localhost:3411/settings
curl -H "x-api-key: TU_BACKEND_API_KEY" http://localhost:3411/settings/mode

# Ollama
curl -H "x-api-key: TU_BACKEND_API_KEY" http://localhost:3411/settings/ollama
curl -H "x-api-key: TU_BACKEND_API_KEY" http://localhost:3411/models/metrics
```

Dashboard: `http://192.168.8.200:3410`

## 5. Primer uso del bot

Manda al bot por WhatsApp **desde tu numero**:

```
/ayuda           lista comandos (incluye los de admin si lo eres)
/quien           confirma que eres admin
/modo            muestra el modo actual
/modelos         lista modelos Ollama
/recordar hoy a las 18:00 revisar Docker
```

## 6. Modos del bot

| Comando | Efecto |
|---|---|
| `/modo private` | Whitelist + admins, comandos + IA. Default |
| `/modo ai` | Igual que private |
| `/modo manual` | Solo admins, solo comandos. Sin IA |
| `/modo silent` | No responde a nada |
| `/modo maintenance` | Solo avisa a admins |
| `/silencio` | Alias de `/modo silent` |
| `/resumir` | Alias de `/modo private` |

## 7. Whitelist desde WhatsApp (siendo admin)

```
/whitelist                          ver lista
/whitelist add 34611222333@c.us     anadir numero
/whitelist del 34611222333@c.us     quitar numero
/admins                             ver admins
```

## 8. Recordatorios en lenguaje natural

```
/recordar hoy a las 18:00 revisar Docker
/recordar en 2 horas revisar logs
/recordar en 3 dias llamar a Juan
/recordar el viernes a las 21:00 hacer backup
/recordar el 25 de mayo pagar el servidor
/recordar manana 09:00 reunion
/recordar 25/12/2026 09:00 felicitar
/recordar +30m revisar horno
/recordar diario 09:00 tomar pastilla
/recordar cada lunes revisar Traefik
/recordar cada 30 minutos comprobar logs
/recordar wa hoy a las 22:00 cerrar ventana
```

## 9. Solucion de problemas

**El bot no responde y soy el dueno:**
- Verifica que `OPENWA_SESSION_PHONE` coincide con tu numero (sin +)
- Usa `/quien` desde WhatsApp para confirmar que eres admin

**401 Unauthorized en el dashboard:**
- Define `BACKEND_API_KEY` con valor real (no sentinela)
- Asegurate que el frontend lo recibe (NEXT_PUBLIC_API_URL correcto)

**Webhook 403:**
- Falta `WEBHOOK_SECRET` o no coincide. Mira `docker compose logs backend`

**Ollama no responde:**
- Desde el contenedor `localhost` NO funciona. Usa `host.docker.internal` o IP de LAN
- Configura `OLLAMA_FALLBACK_URLS` para resiliencia
- `/latencia` desde el bot muestra estado

**Recordatorio "ya paso":**
- TZ del contenedor incorrecta. Verifica `TZ=Europe/Madrid` en `.env`

## 10. Comandos utiles de docker

```bash
docker compose logs -f backend     # logs en vivo
docker compose restart backend     # reiniciar solo backend
docker compose ps                  # estado
docker compose down                # parar (mantiene volumenes)
docker compose down -v             # parar y BORRAR BD (cuidado!)
```

## 11. Cambios importantes respecto a la version anterior

- **Whitelist cerrada por defecto**: lista vacia + `OPEN_TO_ALL=false` = solo admins. Antes respondia a todos
- **API key y webhook secret**: si dejas los valores sentinela, solo loopback puede acceder
- **Modos del bot**: nuevo concepto global
- **Lock por chatId**: evita respuestas paralelas
- **Ollama fallback**: prueba automaticamente las URLs alternativas
- **Parser de recordatorios**: lenguaje natural completo
- **DevTools (dns/headers/ssl)**: bloquean hosts privados (anti-SSRF)
