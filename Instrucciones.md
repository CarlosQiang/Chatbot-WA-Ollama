# LOCAL WHATSAPP OLLAMA HUB

## OBJETIVO

Crear una aplicación local, simple y funcional para hablar con Ollama desde WhatsApp usando OpenWA.

La aplicación debe permitir:

* enviar mensajes por WhatsApp;
* recibir respuestas de Ollama;
* mantener contexto básico de conversación;
* cambiar modelo de Ollama;
* consultar estado de OpenWA;
* consultar estado de Ollama;
* ver logs;
* tener dashboard web premium;
* funcionar 100% en Docker;
* no colisionar con otros contenedores existentes.

NO construir:

* sistema de notas;
* recordatorios;
* second brain;
* CRM;
* automatizaciones avanzadas;
* embeddings;
* memoria compleja.

Arquitectura objetivo:

```txt
WhatsApp
↔ OpenWA
↔ Backend NestJS
↔ Ollama
↔ Backend
↔ OpenWA
↔ WhatsApp
```

---

## INFRAESTRUCTURA EXISTENTE

OpenWA ya está instalado y funcionando.

No reinstalar OpenWA.

No modificar los contenedores actuales de OpenWA.

OpenWA API:

```txt
http://192.168.8.200:2785/api
```

OpenWA Swagger:

```txt
http://192.168.8.200:2785/api/docs
```

OpenWA Dashboard:

```txt
http://192.168.8.200:2887
```

Sesión WhatsApp verificada:

```txt
SESSION_ID=6d50d269-5457-46d0-be01-700ed73ae044
SESSION_NAME=bot-prueba
SESSION_PHONE=34670209033
SESSION_STATUS=ready
```

Formato correcto de chatId:

```txt
34670209033@c.us
```

Ejemplo probado de envío correcto:

```bash
curl -X POST \
-H "x-api-key: TU_API_KEY" \
-H "Content-Type: application/json" \
-d '{"chatId":"34670209033@c.us","text":"🚀 OpenWA funcionando"}' \
http://192.168.8.200:2785/api/sessions/6d50d269-5457-46d0-be01-700ed73ae044/messages/send-text
```

Ollama ya está instalado y funcionando.

No reinstalar Ollama.

No modificar el contenedor actual de Ollama.

Posibles URLs Ollama:

```txt
http://host.docker.internal:11434
http://192.168.8.200:11434
http://ollama:11434
```

Endpoints Ollama a usar:

```txt
GET  /api/tags
POST /api/chat
POST /api/generate
```

---

## STACK

Frontend:

* Next.js
* React
* TypeScript
* TailwindCSS
* shadcn/ui
* Framer Motion
* Zustand
* TanStack Query
* Sonner
* Lucide Icons

Backend:

* NestJS
* TypeScript
* Prisma
* PostgreSQL
* Redis
* Swagger
* WebSockets

Infraestructura:

* Docker Compose
* Healthchecks
* Restart policies
* Volúmenes persistentes
* `.env.example`

---

## PUERTOS OBLIGATORIOS

El servidor ya tiene muchos Docker activos.

No usar puertos comunes ni modificar stacks existentes.

Usar estos puertos:

```txt
Frontend: 3410
Backend API: 3411
PostgreSQL: 5438
Redis: 6385
```

No tocar:

```txt
OpenWA API: 2785
OpenWA Dashboard: 2887
Ollama: 11434
```

---

## NOMBRES DOCKER

Usar prefijo:

```txt
local-ai-hub-
```

Contenedores:

```txt
local-ai-hub-frontend
local-ai-hub-backend
local-ai-hub-postgres
local-ai-hub-redis
```

Red:

```txt
local-ai-hub-network
```

Volúmenes:

```txt
local-ai-hub-postgres-data
local-ai-hub-redis-data
local-ai-hub-backend-data
```

---

## FUNCIONAMIENTO PRINCIPAL

1. El usuario escribe un mensaje por WhatsApp.
2. OpenWA recibe el mensaje.
3. OpenWA llama al webhook del backend.
4. El backend valida el mensaje.
5. El backend detecta si es comando o chat normal.
6. Si es chat normal, envía el texto a Ollama.
7. Ollama responde.
8. El backend envía la respuesta a OpenWA.
9. OpenWA responde por WhatsApp.

---

## COMANDOS WHATSAPP

Todos los comandos deben estar en español.

Comandos IA:

```txt
/ayuda
/estado
/modelos
/modelo <nombre>
/reset
/contexto
```

Comandos sistema:

```txt
/ping
/openwa
/ollama
/logs
/ram
/cpu
/disco
/temperatura
/docker
```

Comportamiento:

* mensaje normal → enviar a Ollama;
* `/modelos` → listar modelos disponibles en Ollama;
* `/modelo llama3` → cambiar modelo activo;
* `/reset` → limpiar contexto conversacional;
* `/estado` → estado de backend, OpenWA y Ollama;
* `/ayuda` → mostrar comandos disponibles.

---

## BASE DE DATOS

Usar PostgreSQL con Prisma.

Tablas mínimas:

```txt
Chat
Message
Session
Setting
Log
```

Guardar:

* mensajes entrantes;
* respuestas salientes;
* modelo usado;
* timestamps;
* errores;
* chatId;
* estado de sesión.

No crear tablas de notas ni recordatorios.

---

## REDIS

Usar Redis para:

* caché;
* rate limiting;
* eventos WebSocket;
* cola ligera de mensajes si hace falta.

---

## BACKEND

Módulos NestJS mínimos:

```txt
AppModule
ConfigModule
HealthModule
OpenWaModule
OllamaModule
ChatModule
CommandModule
WebhookModule
SettingsModule
LogsModule
SystemModule
```

Servicios mínimos:

```txt
OpenWaService
OllamaService
ChatService
CommandService
WebhookService
SettingsService
LogsService
SystemHealthService
```

---

## ENDPOINTS BACKEND PROPIOS

Crear API interna:

```txt
GET  /health
GET  /health/openwa
GET  /health/ollama
GET  /models
POST /models/select
GET  /chats
GET  /chats/:id/messages
POST /webhooks/openwa
GET  /logs
GET  /settings
PUT  /settings
```

Swagger interno disponible en:

```txt
http://IP_SERVIDOR:3411/api
```

---

## OPENWA A CONSUMIR

Usar principalmente:

```txt
GET  /api/sessions
GET  /api/sessions/{id}
POST /api/sessions/{id}/start
POST /api/sessions/{id}/stop
GET  /api/sessions/{id}/qr
GET  /api/sessions/{sessionId}/messages
POST /api/sessions/{sessionId}/messages/send-text
POST /api/sessions/{sessionId}/webhooks
GET  /api/sessions/{sessionId}/webhooks
GET  /api/health
GET  /api/health/ready
GET  /api/stats/overview
```

No hace falta implementar de inicio:

* grupos;
* catálogo;
* canales;
* etiquetas;
* mensajes masivos;
* contactos avanzados.

---

## DASHBOARD

Dashboard en:

```txt
http://IP_SERVIDOR:3410
```

Debe mostrar:

* estado backend;
* estado OpenWA;
* estado Ollama;
* sesión WhatsApp activa;
* modelo Ollama activo;
* modelos disponibles;
* conversaciones recientes;
* últimos mensajes;
* logs recientes;
* uso básico de sistema;
* botón reset contexto;
* selector de modelo.

---

## DISEÑO UI

La interfaz debe ser:

* oscura;
* premium;
* limpia;
* técnica;
* minimalista;
* responsive;
* usable desde móvil.

Inspiración:

* Impeccable
* Taste
* animations.dev
* Floria aesthetic

Evitar:

* gradientes morados AI genéricos;
* dashboard corporativo;
* exceso de glow;
* cards repetidas sin jerarquía;
* textos tipo “Welcome to our platform”.

Motion:

```txt
Hover: 120-180ms
Transiciones: 180-280ms
Modales: 250-380ms
```

Usar Framer Motion con moderación.

Componentes:

```txt
AppShell
Sidebar
StatusBadge
SystemHealthCard
ChatPanel
MessageBubble
ModelSelector
SessionPanel
LogDrawer
EmptyState
ErrorState
LoadingSkeleton
```

---

## SEGURIDAD

Implementar:

* API key interna o JWT simple;
* rate limiting;
* Helmet;
* CORS configurable;
* validación DTO/Zod;
* sanitización de inputs;
* logs de errores.

No exponer secretos en UI.

No mostrar API keys completas.

---

## PERMISOS PARA CLAUDE CODE

Claude tiene permiso para:

* crear archivos;
* modificar archivos;
* eliminar archivos;
* mover archivos;
* refactorizar;
* instalar dependencias;
* crear Dockerfiles;
* crear docker-compose;
* crear scripts;
* crear documentación;
* reorganizar carpetas;
* corregir arquitectura;
* optimizar frontend;
* optimizar backend.

Debe trabajar de forma autónoma.

No debe preguntar por cada archivo.

Puede tomar decisiones razonables.

---

## MODO DE TRABAJO TIPO CAVEMAN

Trabajar como agente autónomo senior.

Prioridades:

1. funcionalidad real;
2. Docker estable;
3. OpenWA integrado;
4. Ollama integrado;
5. chat WhatsApp funcional;
6. dashboard premium;
7. baja latencia;
8. código limpio.

Responder corto.

Formato ideal:

```txt
Hecho:
- ...

Archivos:
- ...

Prueba:
- ...

Siguiente:
- ...
```

Evitar:

* explicaciones largas;
* tutoriales;
* repetir contexto;
* preguntar cosas pequeñas.

---

## FASES

Fase 1:

* estructura monorepo;
* docker-compose;
* `.env.example`;
* backend base;
* frontend base.

Fase 2:

* PostgreSQL;
* Redis;
* Prisma;
* modelos mínimos.

Fase 3:

* OpenWA service;
* Ollama service;
* health checks.

Fase 4:

* webhook OpenWA;
* chat WhatsApp ↔ Ollama.

Fase 5:

* dashboard premium;
* selector de modelo;
* logs;
* conversaciones.

Fase 6:

* polish;
* errores;
* responsive;
* documentación.

---

## RESULTADO FINAL

Debe quedar una aplicación real lista para uso diario:

```txt
WhatsApp ↔ OpenWA ↔ Local WhatsApp Ollama Hub ↔ Ollama
```

Debe ser:

* estable;
* rápida;
* dockerizada;
* sin colisiones de puertos;
* simple;
* bonita;
* mantenible;
* usable desde móvil.
