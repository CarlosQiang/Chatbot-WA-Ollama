# Local WhatsApp Ollama Hub

> Habla con tu Ollama local desde WhatsApp. Todo en tu servidor, sin cloud.

```
WhatsApp ↔ OpenWA ↔ Backend NestJS ↔ Ollama (local o remoto)
```

Aplicación de chat WhatsApp ↔ IA pensada para correr 100% en tu LAN sobre Docker. Permite usar cualquier modelo Ollama (1B, 7B, 70B…) desde cualquier chat de WhatsApp, con dashboard de control, comandos, multi-modelo y selección dinámica del servidor Ollama desde la UI.

## Características

- 🟢 Chat WhatsApp ↔ IA con contexto persistente por chat
- 🧠 Multi-modelo (`llama3.2:1b`, `mistral`, `qwen2.5`, GPT-4o…) cambiable al vuelo
- 🔌 **Proveedor IA intercambiable**: Ollama local **o** OpenAI / OpenRouter / Groq / Together AI (compatible OpenAI API)
- 🌐 Ollama dinámico: apunta a cualquier IP de tu LAN desde el dashboard
- ✍️ **Prompts personalizables** desde la UI: cómo se organizan las notas y cómo se interpretan los recordatorios
- 📝 Notas inteligentes: por defecto solo corrige ortografía + formato suave (no reinterpreta)
- ⏰ Recordatorios en lenguaje natural: "mañana a las 7 avísame de llamar al médico", "el viernes recuérdame comprar cables"
- 🛡️ Whitelist de chats con normalizador (acepta `612345678`, `+34612345678`, `34 612 345 678`)
- 🛠️ Comandos slash: `/estado`, `/modelos`, `/modelo`, `/reset`, `/ram`, etc.
- 📊 Dashboard premium oscuro: chats en vivo, logs, métricas, modelos, comandos
- 🔘 Botones de test: prueba WhatsApp y Ollama en un click
- 🔄 Polling + webhook: funciona aunque OpenWA filtre self-chats
- 🐳 100% Dockerizado con healthchecks y volúmenes persistentes
- 🚫 Sin colisiones: puertos personalizados, no toca otros stacks
- ⚙️ **Todo configurable desde el panel** — no hace falta tocar código ni `.env` después del primer arranque

## Stack

| Capa     | Tecnología |
|----------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind, Framer Motion, Zustand, TanStack Query |
| Backend  | NestJS 10, Prisma, PostgreSQL, Redis, Swagger, Socket.io |
| Infra    | Docker Compose, healthchecks, restart unless-stopped |

## Pre-requisitos

- Docker + Docker Compose v2
- OpenWA corriendo y accesible
- Ollama instalado en el host o en otra máquina de la LAN
- Un WhatsApp escaneado en OpenWA y su API key

## Puertos

| Servicio    | Puerto |
|-------------|--------|
| Frontend    | 3410   |
| Backend API | 3411   |
| PostgreSQL  | 5438   |
| Redis       | 6385   |

## Arranque

```bash
git clone https://github.com/TU_USUARIO/local-ai-hub.git
cd local-ai-hub
cp .env.example .env
nano .env       # poner OPENWA_API_KEY como mínimo
./scripts/start.sh
./scripts/check.sh
```

Dashboard: http://localhost:3410  ·  Swagger: http://localhost:3411/api

Si OpenWA dispara webhooks → funciona out-of-the-box. Si no (caso común en self-chat), el **polling** consulta cada 5 s y procesa los mensajes igual. Activado por defecto.

## Comandos WhatsApp

| Comando | Descripción |
|---------|-------------|
| `/ayuda` | Lista comandos |
| `/estado` | Estado Backend/OpenWA/Ollama/modelo |
| `/modelos` | Modelos disponibles |
| `/modelo <nombre>` | Cambia el modelo activo |
| `/reset` | Borra contexto del chat |
| `/ping` `/openwa` `/ollama` `/ram` `/cpu` `/disco` `/logs` | Diagnósticos |

Cualquier mensaje sin `/` se envía a Ollama y responde como IA.

## Configuración de números WhatsApp

3 conceptos distintos, todos editables desde el dashboard (Ajustes → Números de WhatsApp):

| Concepto | Qué hace | Dónde |
|----------|----------|-------|
| `OPENWA_SESSION_PHONE` | Número del bot escaneado en OpenWA | `.env` |
| `TEST_WHATSAPP_CHAT_ID` | Número de los botones de test | `.env` o UI |
| `ALLOWED_CHAT_IDS` | Whitelist (vacío = todos) | `.env` o UI |

Formato chatId: `34670209033@c.us` (sin `+`).

## Proveedor IA: Ollama o OpenAI

Todo configurable desde **Dashboard → Ajustes → Proveedor IA**, sin tocar `.env`.

| Proveedor | Cuándo | Cómo |
|-----------|--------|------|
| **Ollama** (default) | Modelos locales, privado, sin coste por consulta | URL + modelo |
| **OpenAI / compatible** | GPT-4o, GPT-4o-mini… o cualquier proveedor compatible (OpenRouter, Groq, Together AI) | API key + base URL + modelo |

Cambiar de uno a otro es 1 click en la UI. La clave se guarda cifrada en la base de datos del backend, nunca se devuelve por la API.

## Prompts personalizados

Desde **Dashboard → Ajustes → Prompts personalizados** puedes sobrescribir:

- **Prompt de notas** — cómo la IA organiza el texto cuando mandas algo largo desde Telegram. Por defecto solo corrige ortografía y mejora el formato sin reinterpretar.
- **Prompt de recordatorios** — cómo la IA convierte frases tipo "mañana a las 7 avísame del médico" en `fireAt` + `text`. Solo se usa como fallback cuando el parser estándar no entiende la frase.

Vacíos = se usan los prompts por defecto (suaves, no agresivos).

## Ollama remoto

Por defecto: `http://host.docker.internal:11434` (Ollama en el host).

Para apuntar a otra máquina de la LAN:
1. Dashboard → Ajustes → Ollama
2. URL: `http://192.168.8.150:11434`
3. **Probar conexión** → online + nº modelos
4. **Guardar cambios** → todo el chat usa esa máquina

No uses `localhost` — el backend corre dentro de Docker.

## Estructura

```
.
├── backend/                # NestJS + Prisma
├── frontend/               # Next.js dashboard
├── docs/                   # ARCHITECTURE, COMMANDS, DEPLOY
├── scripts/                # start, stop, check, register-webhook
├── docker-compose.yml
└── .env.example
```

## Documentación completa

- `docs/ARCHITECTURE.md` — diagrama y decisiones técnicas
- `docs/DEPLOY.md` — despliegue paso a paso
- `docs/COMMANDS.md` — todos los comandos WhatsApp

## Troubleshooting

**El bot no responde a mis mensajes**
- Comprueba `POLL_ENABLED=true` en `.env`
- `docker compose logs -f backend`

**Ollama offline en el dashboard**
- Host del Docker → `OLLAMA_BASE_URL=http://host.docker.internal:11434`
- Otra máquina LAN → `http://192.168.x.x:11434`
- No uses `localhost`

**Build de Prisma falla por red**
- El Dockerfile reintenta x3. Si persiste: `docker compose build --no-cache backend`

Más en `docs/DEPLOY.md`.

## Licencia

MIT — ver [LICENSE](LICENSE).
