# Auditoría del proyecto — Local AI Hub (Chatbot-WA)

Fecha: 2026-05-20
Alcance: análisis profundo previo a cambios. NO se ha modificado código.

Leyenda de prioridad:

- **P0** — Bloqueante / riesgo activo. Tocar primero.
- **P1** — Funcionalidad rota o arquitectura frágil. Tocar pronto.
- **P2** — Mejora, UX, deuda.

---

## P0-1 · El bot respondió a todos los contactos: causa exacta

Combinación de tres factores que explican lo de ayer:

1. **Whitelist abierta por defecto.**
   `backend/src/modules/settings/settings.service.ts:102-106`:
   ```ts
   async isAllowed(chatId: string): Promise<boolean> {
     const list = await this.getAllowedChatIds();
     if (list.length === 0) return true; // ← TODOS permitidos
     return list.includes(chatId);
   }
   ```
   Y en `.env.example:102` → `ALLOWED_CHAT_IDS=` está vacío. Sin BD-override, el bot acepta a cualquiera.

2. **Auto-reply pasa por encima de la whitelist.**
   `ingest.service.ts:117-124`:
   ```ts
   const isAutoTarget = await this.settings.isAutoReply(chatId);
   if (!isAutoTarget && !(await this.settings.isAllowed(chatId))) { ... }
   ```
   Si en algún momento se activó auto-reply (vía dashboard o endpoint sin auth), ese chatId responde sí o sí. No hay log de quién/cuándo lo activó.

3. **API key efectivamente desactivada.**
   `common/api-key.guard.ts:24-28`: si `BACKEND_API_KEY` está vacía o vale el sentinela `internal_change_me_token`, la guarda se desactiva entera. El `.env.example` viene exactamente con ese sentinela. Resultado: cualquiera en la LAN puede `PUT /settings` y cambiar whitelist/auto-reply.

**Impacto**: cualquier mensaje entrante de cualquier número es procesado como conversación de Ollama. Si OpenWA recibe spam, el bot responde.

---

## P0-2 · Webhook público sin validar firma

`webhook.controller.ts:11` está marcado `@Public()`. No hay verificación de `WEBHOOK_SECRET` (existe en `.env` pero no se usa).

Cualquiera que llegue a `POST /webhooks/openwa` con un payload `{ chatId, body }` arbitrario puede:

- Provocar respuestas a chats reales (porque el ingest llama a `openwa.sendText`).
- Ejecutar comandos `/modelo`, `/reset`, `/docker`, `/logs`.
- Inflar el contexto de un chat ajeno.

**Vector real**: si el backend es accesible desde la LAN (lo es, `0.0.0.0:3411`), cualquier dispositivo de tu red lo dispara.

---

## P0-3 · SSRF en DevTools y selector de Ollama

`devtools.service.ts`:
- `httpHeaders(url)` → `axios.head(url)` con URL del usuario.
- `dnsLookup(domain)` y `sslInfo(host)` permiten enumerar hosts internos.

`settings.setOllamaBaseUrl(url)` acepta cualquier URL siempre que pase `isValidOllamaUrl` (solo valida `http(s)://` y hostname no vacío). No filtra:

- `http://127.0.0.1:<puerto>` (escapa al host vía `host.docker.internal`).
- `http://169.254.169.254/latest/meta-data/` (metadata cloud).
- `http://localhost:2785/` (apunta OpenWA al backend, fuga).
- IPs privadas no permitidas para tu caso.

Combinado con P0-1/P0-2: alguien externo a tu LAN no llega, pero alguien con red local sí. Y la IA, si en el futuro le das herramientas, puede llamarlas.

---

## P0-4 · Race / doble ingesta polling + webhook

- `poller.service.ts` está activo por defecto (`POLL_ENABLED=true`) y hace `listRecentMessages(20)` cada 5s.
- A la vez, el webhook está registrado en OpenWA (`openwa.service.ts:registerWebhook`).
- Los anti-loops están bien (5 capas), pero:
  - `markMessageSeen` se hace **antes** de procesar (`ingest.service.ts:95-97`). Si Ollama peta a mitad, el mensaje queda como "visto" y nunca se reintenta.
  - `bootstrap()` solo marca **50 mensajes históricos**. Si OpenWA tiene >50 mensajes recientes en el momento del arranque, los desbordados se procesan como si fueran nuevos → **respuestas masivas al primer arranque**. Esto encaja con "ayer respondió a todo el mundo".
  - Si Redis se reinicia (es donde vive `wa:seen:<id>`), todo el dedup desaparece → reprocesado masivo.

---

## P0-5 · ChatService.handleIncomingText salta whitelist

`chat.service.ts:128-137`. Recibe `chatId, text` por endpoint y dispara Ollama + envío. No comprueba whitelist, ni autoreply, ni anti-loop. Con API key efectivamente desactivada (P0-1), es una puerta abierta para mandar mensajes a cualquier chatId a través del bot.

---

## P1-6 · Parser de recordatorios — los formatos que pides

El parser **soporta** "hoy", "+Nd", "diario", "semanal", DD/MM, días de semana — pero la sintaxis no coincide con lo que escribes:

| Lo que escribes              | Lo que entiende           | Estado     |
|------------------------------|---------------------------|------------|
| `hoy a las 18:00 ...`        | `hoy 18:00 ...`           | NO         |
| `en 2 horas ...`             | `+2h ...`                 | NO         |
| `en 3 días ...`              | `+3d ...`                 | NO         |
| `el viernes a las 21:00 ...` | `viernes 21:00 ...`       | NO         |
| `el 25 de mayo ...`          | `25/5 HH:MM ...`          | NO         |
| `cada lunes ...`             | `semanal lunes HH:MM ...` | NO         |

Otros problemas:

- **Timezone**: el parser usa `new Date()` (zona del contenedor, probablemente UTC). El display usa `Europe/Madrid`. Si el contenedor está en UTC y escribes `hoy 18:00`, lo programa para 18:00 UTC = 20:00 Madrid (verano). No hay TZ configurable.
- **Cron tick** (`@Cron(EVERY_MINUTE)`) recorre TODOS los recordatorios cada minuto, no escala, pero ok ~100. El dedupe por minuto con `lastFiredAt` puede saltarse minutos si el tick llega tarde.
- **No hay comando `/recordar` desde WhatsApp** — solo está en Telegram.
- **No hay confirmación con el formato que pides** (`📅 Hoy / ⏰ 18:00`). Solo string ISO.
- **No hay edición** (solo borrar y recrear).
- **`/recordar wa ...`** envía al `testChatId` global, no permite chatId destino.

---

## P1-7 · Cliente Ollama poco robusto

`ollama.service.ts`:

- **Una `AxiosInstance` nueva por llamada** (sin keep-alive).
- **Sin cache** de modelos: cada `/modelos` golpea `/api/tags`.
- **Sin fallback** entre URLs candidatas (la docstring dice "fallback automático" — no existe).
- **Sin healthcheck periódico** que recoloque la URL activa.
- **Sin reintentos**.
- **Sin streaming** (perfectamente soportado por Ollama, mejoraría UX en WhatsApp y dashboard).
- **Latencia** solo se mide en `testConnection`, no en chat real.
- `getActiveBaseUrl()` solo delega a `settings.getOllamaBaseUrl()`, no comprueba si la URL guardada sigue viva antes de devolverla.

---

## P1-8 · Comportamiento de listeners y arquitectura

- **Doble vía de entrada**: webhook + polling activos en paralelo. Recomendación: webhook como camino principal, polling solo si el webhook lleva N segundos sin actividad detectada.
- **`markMessageSeen` antes de procesar**: convierte cualquier crash en pérdida silenciosa de mensajes.
- **Circuit breaker** descarta como `self-echo` sin avisar (`ingest.service.ts:106-115`). Ni notifica admin ni se rearma con un comando manual.
- **`registerWebhook`** se llama desde algún arranque, pero la URL es `WEBHOOK_URL` del env y no se valida que apunte al backend correcto. Si el env queda mal seteado, OpenWA puede enviarle el tráfico a otro sitio.
- **Sin lock por chatId**: dos mensajes simultáneos del mismo número disparan dos `generateAndReply` en paralelo, ambos toman el mismo contexto, y guardan el mensaje del usuario dos veces. No es loop infinito (anti-burst protege), pero contamina contexto.

---

## P1-9 · Falta de modos de funcionamiento

No existen estados globales del bot:

- Modo manual (solo comandos).
- Modo privado (solo whitelist).
- Modo IA conversacional (actual por defecto).
- Modo silencio (no responder a nada, ni a comandos).
- Modo mantenimiento.
- Modo debug (logs verbose temporales).

Hoy, el "estado" es implícito: si `ALLOWED_CHAT_IDS` vacío y `AUTO_REPLY_ENABLED=false`, responde a todos. Si tiene whitelist, responde a esos. No hay forma rápida de "apaga todo" sin tocar BD.

---

## P1-10 · Comandos faltantes y/o frágiles

- `/docker` falla siempre en contenedor sin socket — el mensaje es claro pero el comando no aporta.
- No hay `/uptime`, `/ip` (pública/local), `/git status`, `/contenedores`, `/restart <servicio>` controlados.
- `/temperatura` solo lee `/sys/class/thermal/thermal_zone0/temp` que no existe dentro del contenedor.
- No hay `/listar recordatorios`, `/cancelar`, `/editar` desde WhatsApp.
- No hay `/silencio`, `/pausa`, `/resume` para modos.

---

## P1-11 · Telegram bot — riesgos

- **Whitelist Telegram**: si `TELEGRAM_ALLOWED_USER_IDS=` está vacío, cualquiera con el username del bot puede ejecutar todos los comandos del usuario (`telegram.service.ts:183-189` — el `if` solo aplica si hay IDs configurados). En `.env.example:124` está vacío.
- **`/wa <chatId> <texto>`**: deja mandar texto arbitrario a cualquier chatId WhatsApp desde Telegram. Si el bot de Telegram es público, alguien lo abusa para spamear vía tu WhatsApp.
- **`/aiwa`** lo mismo pero con respuesta de Ollama incluida.
- **Polling Telegram** cada 2s, `getUpdates` con timeout 25s mientras el `axios` espera 35s. OK, pero si el polling se solapa pierdes mensajes (línea 157 evita solapamiento — bien).

---

## P2-12 · Observabilidad / auditoría

- Logs en BD via `LogsService.write`, pero sin estructura (`meta` opcional, formato libre).
- Sin `request_id` / `trace_id` entre webhook → ingest → ollama → openwa.
- Sin auditoría de cambios sensibles (`setActiveModel`, `setAllowedChatIds`, `setAutoReply`, `setOllamaBaseUrl`).
- Sin métricas: nº mensajes/min, latencia P95 Ollama, tasa de errores, tamaño de contexto.

---

## P2-13 · Seguridad operativa

- `BACKEND_API_KEY=internal_change_me_token` en `.env.example` → desactiva el guard (sentinela tratada como vacío).
- `helmet({ crossOriginResourcePolicy: false })` — está, pero el frontend está separado y WS aparte; comprobar que CSP por defecto no rompa nada.
- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])` → 5 rps global. El webhook + frontend + telegram comparten cuota; en burst real lo agotas.
- `child_process.exec` en `system.service.ts:disk` y `command.service.ts:/docker`: hoy con argumentos fijos (seguros), pero el patrón está ahí. Cualquier futura ampliación que pase argumentos del usuario → command injection trivial.

---

## P2-14 · UX / dashboard

(No inspeccioné a fondo el frontend, pero por la estructura)

- Hay vistas separadas: dashboard, chats, commands, autoreply, telegram, reminders, models, connections, settings, logs.
- Falta panel claro de **modos** (manual/privado/silencio/IA).
- Falta panel de **whitelist** visible (`autoreply-view.tsx` lo cubre parcialmente, no es lo mismo).
- Sin **dashboard de salud agregada** (OpenWA/Ollama/Redis/Postgres) en una sola tarjeta visible al entrar.

---

# Propuesta de mejoras priorizadas

Orden de implementación (incremental, sin rehacer):

## Sprint 1 · Seguridad inmediata (1-2 commits pequeños)

1. **Reforzar guard**: tratar `internal_change_me_token` como inválido y exigir API key si se accede desde fuera de `127.0.0.1`. Permitir bypass solo para `loopback` o cuando `NODE_ENV=development`.
2. **Firma del webhook**: validar `X-OpenWA-Signature` (HMAC con `WEBHOOK_SECRET`) o, mínimo, comprobar IP de origen.
3. **Whitelist cerrada por defecto**: cambiar la semántica — lista vacía = NADIE responde (excepto bot mismo). Migración: poblar `ALLOWED_CHAT_IDS` con `OPENWA_SESSION_PHONE@c.us` automáticamente en la primera arrancada.
4. **Validar Ollama URL**: bloquear `localhost/127.0.0.1/169.254.x.x` salvo flag explícito.
5. **Validar `httpHeaders/dnsLookup/sslInfo`** para no permitir IPs privadas no whitelisteadas.
6. **No marcar `markMessageSeen` hasta procesado OK** (mover al final del flujo, con TTL corto si falla para no reintentar infinito).

## Sprint 2 · Comportamiento del bot

7. **Modos globales** en `Settings`:
   - `bot_mode`: `manual | private | ai | silent | maintenance`.
   - Aplicar en `ingest.service.ts` antes de la whitelist.
   - Comandos `/modo <x>`, `/silencio`, `/resumir` desde Telegram + WhatsApp (este último solo para chatIds admin).
8. **Admin chatIds**: añadir `ADMIN_CHAT_IDS` separado de whitelist. Solo admins ejecutan comandos sensibles (`/modelo`, `/reset` ajeno, `/modo`).
9. **Auditoría de cambios sensibles**: cada `setAutoReply`, `setActiveModel`, `setAllowedChatIds`, `setOllamaBaseUrl` queda registrado con `who` y `when`.
10. **Lock por chatId** en `generateAndReply` (Redis SETNX, TTL 60s) para evitar respuestas duplicadas.

## Sprint 3 · Recordatorios

11. **Parser de lenguaje natural**:
    - Aceptar `a las HH(:MM)?`, `en N (segundo|minuto|hora|día|semana)s?`, `el (lunes|...)`, `el N (de)? (enero|...|mes)`, `cada (lunes|...)`, `hoy/mañana/pasado`.
    - Mantener compat con sintaxis actual.
    - Test unitarios para cada frase del enunciado.
12. **TZ configurable** (`REMINDER_TZ`, default `Europe/Madrid`). Persistir y aplicar en parser + cron tick + display.
13. **Confirmación bonita**: `✅ Recordatorio guardado: "Revisar Docker"  📅 Hoy  ⏰ 18:00`.
14. **Comandos desde WhatsApp**: `/recordar`, `/recordatorios`, `/borrar`, `/editar`.
15. **Edición**: `/editar <id> <nueva expresión>`.

## Sprint 4 · Ollama

16. **`OllamaClient` con un solo Axios + keep-alive + reintentos**.
17. **Selector con fallback**: lista priorizada de URLs candidatas en `OLLAMA_FALLBACK_URLS=...`. Healthcheck cada 30s. URL activa = primera que responde.
18. **Cache modelos** (TTL 60s en Redis).
19. **Latencia P50/P95** registrada en logs estructurados.
20. **Streaming** para chat (opcional, mejora UX pero requiere cambios en `openwa.sendText` por chunks).

## Sprint 5 · Comandos extra y UX

21. Comandos: `/uptime`, `/ip local`, `/ip publica`, `/git status`, `/contenedores`, `/sesiones`, `/tareas`, `/health`.
22. Para `/docker ps`: opción A — montar socket con un sidecar de solo lectura; opción B — exponer endpoint Docker via socket-proxy con allowlist (`tecnativa/docker-socket-proxy`).
23. Frontend: tarjeta "Modos" con un único selector. Tarjeta "Salud" agregada. Vista de "Auditoría" con últimas 50 acciones sensibles.

## Sprint 6 · Resiliencia

24. **Polling como fallback**: arrancar SOLO si el webhook no recibe pings de OpenWA en X segundos. Apagar polling automáticamente cuando vuelve.
25. **Bootstrap polling**: marcar TODOS los mensajes históricos como vistos (`limit=500` o iterar hasta no haber nuevos).
26. **Circuit breaker** avisable: cuando salta, mandar 1 mensaje a admin con instrucciones de rearme (`/rearmar <chatId>`).

---

# Riesgos por orden de explotabilidad

1. Webhook público → falsificación de mensajes.
2. API key desactivada por sentinela → PUT /settings abierto.
3. Whitelist abierta por defecto + auto-reply bypass → respuestas masivas.
4. SSRF vía DevTools y selector Ollama.
5. `handleIncomingText` sin whitelist.
6. Bootstrap polling solo 50 mensajes → respuesta masiva al reinicio.

---

# Lo que NO hay que tocar

- Estructura general del proyecto (NestJS + Next.js + Prisma + Redis): es la correcta.
- `OPENWA_SESSION_*`: configuración externa, no nuestra.
- Tablas Prisma: añadir, no reescribir.
- Diseño visual del frontend: cumple los criterios del Instrucciones.md.

---

Siguiente paso sugerido: empezar por **P0-1 + P0-2 + P0-5** en un solo commit pequeño porque resuelven el incidente real de ayer. Luego seguir con Sprint 1.
