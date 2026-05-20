# Comandos WhatsApp y Telegram

Todos los comandos empiezan por `/`. Cualquier otro mensaje (sin `/`) se envía
al modelo Ollama activo si el modo del bot lo permite (`private` o `ai`).

Comandos marcados `(admin)` solo los pueden ejecutar chatIds en
`ADMIN_CHAT_IDS` (o el propio número de la sesión OpenWA, que es admin
automáticamente).

## Modos del bot

| Modo | Comportamiento |
|---|---|
| `manual` | Solo procesa comandos enviados por admins. No hay chat IA. |
| `private` | Comandos + chat IA, solo para whitelist y admins. **Default**. |
| `ai` | Alias de `private`, orientado a conversación con Ollama. |
| `silent` | No responde a nada. Útil para silenciar el bot sin pararlo. |
| `maintenance` | Solo avisa a admins, ignora resto. |

Cambia el modo con `/modo <nombre>` o `/silencio` / `/resumir`.

## IA / Chat

| Comando | Descripción |
|---|---|
| `/ayuda` | Lista todos los comandos. Alias: `/help`, `/start` |
| `/estado` | Estado de Backend, OpenWA, Ollama, modelo y modo activo |
| `/modelos` | Lista modelos disponibles en Ollama |
| `/modelo <nombre>` | Cambia el modelo activo (admin). Acepta prefijo |
| `/reset` | Borra el historial de contexto de este chat |
| `/contexto` | Cuántos mensajes hay en el contexto actual |
| `/latencia` | Métricas P50/P95/P99 de Ollama |

## Recordatorios (lenguaje natural)

Acepta múltiples sintaxis. El parser entiende "a las", "el", "de", tildes,
mayúsculas, etc.

```
/recordar hoy a las 18:00 revisar Docker
/recordar en 2 horas revisar logs
/recordar en 3 días llamar a Juan
/recordar el viernes a las 21:00 hacer backup
/recordar el 25 de mayo pagar el servidor
/recordar mañana 09:00 reunión
/recordar 25/12/2026 09:00 felicitar
/recordar +30m revisar horno
/recordar diario 09:00 tomar pastilla
/recordar cada lunes revisar Traefik
/recordar cada lunes a las 08:00 sacar basura
/recordar cada 30 minutos comprobar logs
/recordar wa hoy a las 22:00 cerrar ventana   ← envía a WhatsApp
```

| Comando | Descripción |
|---|---|
| `/recordar <expresión>` | Crea recordatorio |
| `/recordatorios` | Lista los activos |
| `/borrar <id>` | Cancela un recordatorio (basta los 6 primeros caracteres) |

Zona horaria configurable con `REMINDER_TZ` (default `Europe/Madrid`).

## Admin

| Comando | Descripción |
|---|---|
| `/modo` | Modo actual + lista de modos |
| `/modo <nombre>` | Cambia el modo (admin) |
| `/silencio` | Alias de `/modo silent` (admin) |
| `/resumir` | Alias de `/modo private` (admin) |
| `/whitelist` | Lista whitelist actual |
| `/whitelist add <chatId>` | Añade número a la whitelist |
| `/whitelist del <chatId>` | Quita número de la whitelist |
| `/admins` | Lista chatIds con permisos admin |

## Sistema / Red

| Comando | Descripción |
|---|---|
| `/ping` | Responde `pong` |
| `/quien` | Tu chatId y si eres admin |
| `/uptime` | Tiempo activo del backend |
| `/ip` | IPs locales del backend (admin) |
| `/ippub` | IP pública (admin) |
| `/openwa` | Estado de la API OpenWA (admin) |
| `/ollama` | Estado de Ollama + latencia + URL activa |
| `/ram` | Uso de memoria |
| `/cpu` | Cores y load average |
| `/disco` | Uso del filesystem |
| `/temperatura` | Temperatura del CPU (si disponible) |
| `/docker` | Lista contenedores (requiere docker.sock montado, admin) |
| `/logs` | Últimos 10 logs del sistema (admin) |

## DevTools (solo Telegram)

| Comando | Descripción |
|---|---|
| `/hash <md5\|sha256\|sha512> <texto>` | Hashes |
| `/hashes <texto>` | Todos los hashes |
| `/b64 enc\|dec <texto>` | Base64 |
| `/url enc\|dec <texto>` | URL encode/decode |
| `/jwt <token>` | Decodifica payload JWT |
| `/uuid` | UUID v4 |
| `/pass [length]` | Password seguro |
| `/timestamp [unix\|iso]` | Convierte fechas |
| `/regex <patrón> <texto>` | Test de regex |

## Ciberseguridad (solo Telegram)

| Comando | Descripción |
|---|---|
| `/dns <dominio>` | A/AAAA/MX/NS/TXT (bloquea hosts privados) |
| `/headers <url>` | HTTP headers (bloquea hosts privados) |
| `/ssl <dominio>` | Info certificado SSL (bloquea hosts privados) |
| `/cve <CVE-XXXX-YYYY>` | Info de CVE desde NVD |

> Las herramientas que aceptan hostnames del usuario bloquean rangos privados
> (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x) por seguridad (SSRF). Si
> necesitas escanear tu LAN intencionalmente hazlo desde la propia red.

## Comportamiento por defecto

- Los mensajes de grupos (`@g.us`) se ignoran.
- Los mensajes propios (`fromMe`) se ignoran (anti-bucle de 5 capas).
- Si Ollama falla, el bot responde con `⚠️ Error Ollama (<modelo>): <mensaje>`.
- El contexto se limita a las últimas 20 interacciones (configurable con `CHAT_CONTEXT_MAX_MESSAGES`).
- En modo `private`/`ai`, si tu chatId no está en `ALLOWED_CHAT_IDS` ni en
  `ADMIN_CHAT_IDS`, el bot NO responde (esta es la diferencia respecto a
  versiones anteriores donde la whitelist vacía abría el bot a todos).
- Lock por chatId (Redis SETNX, TTL 60s): dos mensajes simultáneos del mismo
  chat no disparan dos respuestas Ollama paralelas.
