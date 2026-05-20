# Arquitectura

## Diagrama

```
┌─────────────┐       ┌──────────────┐
│  WhatsApp   │◀─────▶│   OpenWA     │   (existente, no se toca)
└─────────────┘       │  :2785 /api  │
                      └───────┬──────┘
                              │ webhook
                              ▼
              ┌───────────────────────────────┐
              │   Backend NestJS  :3411       │
              │                               │
              │   webhook → command/chat      │
              │   chat → Ollama → reply       │
              │   reply → openwa.sendText     │
              └──┬──────┬──────┬──────┬───────┘
                 │      │      │      │
       ┌─────────┘      │      │      └───────────┐
       ▼                ▼      ▼                  ▼
  ┌─────────┐    ┌─────────┐ ┌────────┐    ┌─────────────┐
  │Postgres │    │  Redis  │ │ Ollama │    │  Frontend   │
  │ :5438   │    │  :6385  │ │ :11434 │    │  :3410      │
  └─────────┘    └─────────┘ └────────┘    └─────────────┘
                              (host)        Next.js standalone
```

## Flujo de mensaje

1. Usuario envía mensaje WhatsApp.
2. OpenWA recibe el mensaje y dispara POST al webhook del backend.
3. `WebhookController.openwa()` normaliza payload (chatId, text, fromMe, displayName).
4. Filtra: `fromMe` y grupos (`@g.us`).
5. `ChatService.ensureChat()` crea/actualiza el chat en BD.
6. `ChatService.saveMessage()` guarda el inbound con role=user.
7. Si `text.startsWith('/')` → `CommandService.handle()` ejecuta comando.
8. Si no → `ChatService.generateAndReply()`:
   - Carga modelo activo (`SettingsService`) y system prompt
   - Carga últimos 20 mensajes (`getContext`)
   - Llama `OllamaService.chat()`
   - Guarda respuesta en BD (role=assistant)
   - Envía respuesta vía `OpenWaService.sendText()`

## Decisiones técnicas

### Persistencia
- **PostgreSQL**: mensajes, chats, settings, logs, sessions.
- **Prisma**: ORM. Esquema en `backend/prisma/schema.prisma`.
- **`prisma db push`** en lugar de migrations: simplifica deploy local, sin overhead de migraciones para una app monousuario.

### Contexto
- Se persiste cada mensaje en BD.
- `getContext()` lee los últimos N (default 20) mensajes con status=ok.
- `/reset` borra el contexto completo del chat (DELETE messages).

### Comandos
- `CommandService.isCommand()` detecta prefijo `/`.
- Parser sencillo: `command [args...]`.
- Cada comando guarda su respuesta como mensaje role=assistant para que aparezca en la UI.

### Modelos
- `SettingsService.getActiveModel()` lee `Setting.active_model` o cae al env `OLLAMA_DEFAULT_MODEL`.
- `/modelo <nombre>` admite match exacto o prefijo (ej: `/modelo llama3` matchea `llama3:latest`).

### Tiempo real
- `RealtimeGateway` emite `message:new` y `log:new` por socket.io.
- El frontend hace polling con TanStack Query (intervalos 3-8s). Si en el futuro se desea push, el gateway ya está listo.

### Seguridad
- `Helmet` activado.
- `ThrottlerGuard`: 300 req/min global.
- `ApiKeyGuard`: opcional. Si `BACKEND_API_KEY` no es el default, exige header `x-api-key`.
- `@Public()`: marca rutas exentas (webhook, health).
- `AllExceptionsFilter`: respuesta JSON uniforme y logging selectivo (solo 5xx).

### Frontend
- Next.js 14 App Router, output `standalone`.
- Estado global con Zustand (`view`, `selectedChatId`, `sidebarOpen`).
- Datos con TanStack Query (cache + refetchInterval).
- Animaciones con Framer Motion (transitions 180-280ms).
- Tailwind con paleta personalizada en `tailwind.config.ts`.
- Responsive: sidebar como drawer móvil, vista chats hace toggle lista/panel.

## Esquema de BD

```
Session   ─ sesión OpenWA (id, name, phone, status)
Chat      ─ una conversación WhatsApp (chatId@c.us único)
Message   ─ N mensajes por chat (direction in/out, role user/assistant)
Setting   ─ key/value (active_model, system_prompt)
Log       ─ logs estructurados (level, source, message)
```

Relaciones:
- `Message.chatId` → `Chat.chatId` (cascade delete).

## Puertos

| Servicio | Externo | Interno |
|----------|---------|---------|
| Frontend | 3410 | 3000 |
| Backend  | 3411 | 3411 |
| Postgres | 5438 | 5432 |
| Redis    | 6385 | 6379 |

## Volúmenes Docker

- `local-ai-hub-postgres-data` — datos Postgres.
- `local-ai-hub-redis-data` — AOF Redis.
- `local-ai-hub-backend-data` — reservado para futuro.

## Red

- `local-ai-hub-network` (bridge). Backend y frontend resuelven Postgres/Redis por nombre de contenedor.
- Para llamar al host (Ollama): `host.docker.internal` (extra_hosts en compose).
