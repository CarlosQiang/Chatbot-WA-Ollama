import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { LogsService } from '../logs/logs.service';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { isPlaceholderWebhookSecret } from '../../common/validators';

@Injectable()
export class OpenWaService {
  private readonly logger = new Logger(OpenWaService.name);
  // TTL del dedup de "mensajes propios" en segundos
  private readonly ECHO_TTL_SEC = 60;

  // Caché del cliente axios, invalidado cuando cambian URL/apiKey.
  private cachedHttp: AxiosInstance | null = null;
  private cachedBaseUrl = '';
  private cachedApiKey = '';

  /**
   * Firma invisible al inicio de cada mensaje del bot.
   * ZWSP (U+200B) + ZWNJ (U+200C) + ZWSP. El usuario no la ve, el ingest la detecta.
   */
  static readonly BOT_SIGNATURE = '​‌​';

  static isBotSignedMessage(text: string): boolean {
    return typeof text === 'string' && text.startsWith(OpenWaService.BOT_SIGNATURE);
  }

  constructor(
    private readonly logs: LogsService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Devuelve un cliente axios configurado con la URL y API key ACTUALES
   * (Settings → env fallback). Si cualquiera de las dos cambia respecto a
   * la última llamada, recrea el cliente. Esto permite editar la API key
   * desde el dashboard y que el cambio aplique en caliente, sin reiniciar.
   */
  private async http(): Promise<AxiosInstance> {
    const baseUrl = await this.settings.getOpenWaApiUrl();
    const apiKey = await this.settings.getOpenWaApiKey();
    if (
      this.cachedHttp &&
      this.cachedBaseUrl === baseUrl &&
      this.cachedApiKey === apiKey
    ) {
      return this.cachedHttp;
    }
    this.cachedHttp = axios.create({
      baseURL: baseUrl,
      timeout: 30_000,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    this.cachedBaseUrl = baseUrl;
    this.cachedApiKey = apiKey;
    return this.cachedHttp;
  }

  /**
   * Invalida la caché del cliente. Llamar tras cambiar URL/apiKey desde
   * el controlador (aunque el http() lo detecta solo, esto fuerza recarga
   * inmediata en el siguiente request).
   */
  invalidateClient() {
    this.cachedHttp = null;
    this.cachedBaseUrl = '';
    this.cachedApiKey = '';
  }

  /**
   * Session ID activo. Lee de Settings → process.env. Se usa en cada
   * llamada a la API; un switch desde el dashboard impacta al instante.
   */
  async getSessionId(): Promise<string> {
    return this.settings.getOpenWaSessionId();
  }

  async getBotPhone(): Promise<string> {
    return this.settings.getOpenWaSessionPhone();
  }

  // ─── Dedup por contenido (fallback) ────────────────────────
  private dedupKey(chatId: string, text: string) {
    const h = crypto.createHash('sha1').update(`${chatId}::${text}`).digest('hex');
    return `wa:sent:${h}`;
  }
  private async markAsSent(chatId: string, text: string) {
    try {
      await this.redis.set(this.dedupKey(chatId, text), '1', this.ECHO_TTL_SEC);
    } catch {}
  }
  async isOwnEcho(chatId: string, text: string): Promise<boolean> {
    try {
      const key = this.dedupKey(chatId, text);
      const v = await this.redis.get(key);
      if (v) {
        await this.redis.del(key);
        return true;
      }
    } catch {}
    return false;
  }

  // ─── Dedup por messageId ───────────────────────────────────
  async isOwnMessage(messageId: string): Promise<boolean> {
    if (!messageId) return false;
    try {
      const v = await this.redis.get(`wa:ownsent:${messageId}`);
      return v === '1';
    } catch {
      return false;
    }
  }
  async markMessageSeen(messageId: string): Promise<boolean> {
    try {
      const r = await this.redis.client.set(`wa:seen:${messageId}`, '1', 'EX', 3600, 'NX');
      return r === 'OK';
    } catch {
      return true;
    }
  }

  // ─── Circuit breaker ───────────────────────────────────────
  async checkBurst(chatId: string, max = 6, windowSec = 30) {
    try {
      const key = `wa:burst:${chatId}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, windowSec);
      return { tripped: count > max, count };
    } catch {
      return { tripped: false, count: 0 };
    }
  }

  // ─── HTTP API ──────────────────────────────────────────────
  async health() {
    const t0 = Date.now();
    let baseUrl: string | null = null;
    try {
      baseUrl = await this.settings.getOpenWaApiUrl();
    } catch {}
    try {
      const http = await this.http();
      const { data } = await http.get('/health');
      return {
        ok: true,
        latencyMs: Date.now() - t0,
        baseUrl,
        sessionId: await this.getSessionId().catch(() => null),
        data,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        baseUrl,
        error: (err as Error).message,
      };
    }
  }

  async ready() {
    try {
      const http = await this.http();
      const { data } = await http.get('/health/ready');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async stats() {
    try {
      const http = await this.http();
      const { data } = await http.get('/stats/overview');
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  // ─── Resolver @lid -> @c.us ───────────────────────────────
  //
  // WhatsApp envía hoy muchos mensajes con chatId `@lid` (LinkedId,
  // identificador opaco por contacto). El usuario solo conoce números
  // de teléfono, así que tenemos que traducir `@lid` -> `@c.us` para
  // que la lista Auto-IA matchee aunque el usuario meta solo el número.
  //
  // Probamos varios endpoints de OpenWA porque la API ha cambiado entre
  // versiones. Cualquiera de los formatos sirve siempre que devuelva
  // algo parseable como `number`, `id`, `id._serialized`, `wid`, etc.
  // Cacheamos el resultado en Redis 7 días (`wa:lid2phone:<lid>`) para
  // no martillar a OpenWA con cada mensaje.

  private readonly LID_CACHE_TTL_SEC = 7 * 24 * 3600;

  /**
   * Dado un chatId que puede ser `@lid` o `@c.us`, devuelve el chatId
   * canónico de TELÉFONO (`<digits>@c.us`). Si el input ya es `@c.us`,
   * lo devuelve tal cual. Si es `@lid` y se puede resolver, devuelve
   * el `@c.us` correspondiente. Si no se puede resolver, devuelve null.
   *
   * NUNCA lanza — los fallos quedan en logs y se devuelve null para
   * que el caller pueda decidir el fallback (ej. log warn al usuario).
   */
  async resolveContactPhone(chatId: string): Promise<string | null> {
    if (!chatId || typeof chatId !== 'string') return null;
    // Phone-based ya: devuelve directamente.
    if (chatId.endsWith('@c.us')) return chatId;
    if (chatId.endsWith('@s.whatsapp.net')) {
      return chatId.replace(/@s\.whatsapp\.net$/i, '@c.us');
    }
    if (!chatId.endsWith('@lid')) return null;

    // Versión v2 del cache: el deploy anterior cacheó "phones" falsos
    // (mismos dígitos que el lid). Subir el prefijo invalida TODAS las
    // entradas viejas sin tener que correr un FLUSHDB.
    const cacheKey = `wa:lid2phone:v2:${chatId}`;
    const lidDigitsForRead = chatId.replace(/@lid$/i, '').replace(/\D/g, '');
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached === '__none__') return null;
      if (cached) {
        // Defense-in-depth: si una entrada cacheada coincide en dígitos
        // con el lid (no debería con el v2, pero por si acaso futuro),
        // la descartamos y forzamos re-resolución.
        const cachedDigits = cached.replace(/@c\.us$/, '');
        const cachedTooLong = cachedDigits.length > 15;
        const cachedSameAsLid = cachedDigits === lidDigitsForRead;
        if (cachedSameAsLid || cachedTooLong) {
          await this.redis.del(cacheKey).catch(() => null);
          await this.logs.write(
            'warn',
            'openwa',
            `LID cache corrupto descartado para ${chatId} (valor "${cached}")`,
          );
        } else {
          return cached;
        }
      }
    } catch {}

    let resolved: string | null = null;
    try {
      const sid = await this.getSessionId();
      const http = await this.http();
      // Lista de rutas a probar, en orden. Cada API de OpenWA expone una
      // variante distinta; nos detenemos en la primera que responda 2xx.
      const candidates: Array<() => Promise<any>> = [
        () => http.get(`/sessions/${sid}/contacts/${encodeURIComponent(chatId)}`),
        () => http.get(`/sessions/${sid}/contacts/${encodeURIComponent(chatId)}/profile`),
        () => http.get(`/sessions/${sid}/profile/${encodeURIComponent(chatId)}`),
        () => http.post(`/sessions/${sid}/chats/getNumberProfile`, { chatId }),
        () => http.post(`/sessions/${sid}/getNumberProfile`, { chatId }),
      ];

      // Dígitos del lid original — necesitamos compararlos con cualquier
      // "phone" que devuelva OpenWA. Muchas versiones de OpenWA devuelven
      // EL MISMO lid disfrazado con sufijo @c.us; eso no es resolución
      // real, es ruido. Filtramos esos falsos positivos.
      const lidDigits = chatId.replace(/@lid$/i, '').replace(/\D/g, '');

      for (const call of candidates) {
        try {
          const { data } = await call();
          const candidate = this.extractPhoneChatId(data);
          if (!candidate) continue;
          // Rechazo 1: dígitos idénticos al lid -> el endpoint no resolvió,
          // solo nos devolvió el mismo id con otro sufijo.
          if (candidate.replace(/@c\.us$/, '') === lidDigits) continue;
          // Rechazo 2: más de 15 dígitos no es un teléfono E.164 válido.
          // Los `@lid` opacos suelen tener 14-18 dígitos. Los teléfonos
          // reales (incluidos los más largos) caben en 15.
          const candDigits = candidate.replace(/@c\.us$/, '');
          if (candDigits.length > 15) continue;
          resolved = candidate;
          break;
        } catch {
          // siguiente
        }
      }
    } catch (err) {
      await this.logs.write(
        'warn',
        'openwa',
        `resolveContactPhone(${chatId}) excepción global: ${(err as Error).message}`,
      );
    }

    try {
      // Cachea positivo 7d, negativo 1h (para reintentar pronto si la
      // API empieza a responder más tarde).
      if (resolved) {
        await this.redis.set(cacheKey, resolved, this.LID_CACHE_TTL_SEC);
      } else {
        await this.redis.set(cacheKey, '__none__', 3600);
      }
    } catch {}

    if (resolved) {
      await this.logs.write(
        'info',
        'openwa',
        `LID resuelto ${chatId} -> ${resolved}`,
      );
    } else {
      await this.logs.write(
        'debug',
        'openwa',
        `LID NO resuelto ${chatId} (ningún endpoint de OpenWA devolvió phone)`,
      );
    }

    return resolved;
  }

  /**
   * Borra TODAS las entradas del cache lid→phone. Útil cuando una
   * versión anterior cacheó datos erróneos y quieres limpiarlas sin
   * esperar al TTL de 7 días. Devuelve el nº de entradas borradas.
   */
  async purgeLidCache(): Promise<number> {
    let removed = 0;
    try {
      // SCAN para no bloquear Redis con KEYS en producción.
      let cursor = '0';
      do {
        const [next, batch] = await this.redis.client.scan(
          cursor,
          'MATCH',
          'wa:lid2phone:*',
          'COUNT',
          100,
        );
        cursor = next;
        if (batch.length) {
          await this.redis.client.del(...batch);
          removed += batch.length;
        }
      } while (cursor !== '0');
    } catch (err) {
      await this.logs.write(
        'warn',
        'openwa',
        `purgeLidCache fallo: ${(err as Error).message}`,
      );
    }
    if (removed > 0) {
      await this.logs.write(
        'info',
        'openwa',
        `LID cache purgado: ${removed} entradas eliminadas`,
      );
    }
    return removed;
  }

  /**
   * Extrae un chatId `<digits>@c.us` de una respuesta de OpenWA que
   * puede venir en muchos formatos distintos según la versión:
   *  - `{ number: "34670209033" }`
   *  - `{ id: "34670209033@c.us" }`
   *  - `{ id: { _serialized: "34670209033@c.us", user: "34670209033" } }`
   *  - `{ wid: { _serialized: "..." } }`
   *  - `{ jid: "34670209033@s.whatsapp.net" }`
   */
  private extractPhoneChatId(data: any): string | null {
    if (!data || typeof data !== 'object') return null;
    const candidates: any[] = [
      data.phoneChatId,
      data.phone,
      data.number,
      data.jid,
      typeof data.id === 'string' ? data.id : data.id?._serialized,
      data.id?.user,
      data.wid?._serialized,
      data.wid?.user,
      data.contact?.id?._serialized,
      data.contact?.number,
    ];
    for (const c of candidates) {
      if (typeof c !== 'string' || !c) continue;
      // Si trae sufijo phone-like o no trae sufijo (solo dígitos), lo
      // convertimos a `<digits>@c.us`. Si trae `@lid`, no nos vale.
      if (c.endsWith('@lid')) continue;
      const digits = c.replace(/@.+$/, '').replace(/\D/g, '');
      if (/^\d{6,18}$/.test(digits)) return `${digits}@c.us`;
    }
    return null;
  }

  async listSessions() {
    const http = await this.http();
    const { data } = await http.get('/sessions');
    return data;
  }

  async getSession(id?: string) {
    try {
      const sid = id || (await this.getSessionId());
      if (!sid) return { error: 'Sin OPENWA_SESSION_ID configurado' };
      const http = await this.http();
      const { data } = await http.get(`/sessions/${sid}`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async startSession(id?: string) {
    const sid = id || (await this.getSessionId());
    if (!sid) throw new Error('Sin OPENWA_SESSION_ID configurado');
    const http = await this.http();
    const { data } = await http.post(`/sessions/${sid}/start`);
    return data;
  }

  async stopSession(id?: string) {
    const sid = id || (await this.getSessionId());
    if (!sid) throw new Error('Sin OPENWA_SESSION_ID configurado');
    const http = await this.http();
    const { data } = await http.post(`/sessions/${sid}/stop`);
    return data;
  }

  async getQr(id?: string) {
    try {
      const sid = id || (await this.getSessionId());
      if (!sid) return { error: 'Sin OPENWA_SESSION_ID configurado' };
      const http = await this.http();
      const { data } = await http.get(`/sessions/${sid}/qr`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async listWebhooks(id?: string) {
    try {
      const sid = id || (await this.getSessionId());
      if (!sid) return [];
      const http = await this.http();
      const { data } = await http.get(`/sessions/${sid}/webhooks`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Crea una nueva sesión en OpenWA. Si `setActive` es true, también la
   * guarda como sesión activa en Settings (api key y url no cambian).
   */
  async createSession(params: {
    name: string;
    phone?: string;
    setActive?: boolean;
  }): Promise<any> {
    if (!params.name?.trim()) {
      throw new Error('Falta el nombre de la sesión');
    }
    const http = await this.http();
    const body: any = { name: params.name.trim() };
    if (params.phone) body.phone = params.phone.trim();
    const { data } = await http.post('/sessions', body);
    const newId: string | undefined = data?.id || data?.sessionId;
    if (params.setActive && newId) {
      await this.settings.setOpenWaSessionId(newId, 'dashboard');
      await this.settings.setOpenWaSessionName(params.name, 'dashboard');
      if (params.phone) await this.settings.setOpenWaSessionPhone(params.phone, 'dashboard');
      this.invalidateClient();
    }
    await this.logs.write(
      'info',
      'openwa',
      `Nueva sesión creada: ${params.name} (${newId})`,
    );
    return data;
  }

  /**
   * Cambia la sesión activa SIN tocar la API key/URL. Después de esto
   * todas las llamadas (sendText, etc.) van a la nueva sesión.
   */
  async setActiveSession(id: string) {
    if (!id?.trim()) throw new Error('Falta el ID de sesión');
    // Intentamos sacar el nombre y teléfono desde OpenWA para guardarlos
    const info = await this.getSession(id);
    const name = info?.name || '';
    const phone = info?.phone || info?.me?.user || '';
    await this.settings.setOpenWaSessionId(id, 'dashboard');
    if (name) await this.settings.setOpenWaSessionName(name, 'dashboard');
    if (phone) await this.settings.setOpenWaSessionPhone(phone, 'dashboard');
    this.invalidateClient();
    await this.logs.write(
      'info',
      'openwa',
      `Sesión activa cambiada -> ${id} (${name || 'sin nombre'})`,
    );
    return { id, name, phone };
  }

  /**
   * Cierra la sesión (logout WhatsApp) — el siguiente arranque pide QR.
   * NO borra la sesión de OpenWA, solo la desautentica.
   */
  async logoutSession(id?: string) {
    const sid = id || (await this.getSessionId());
    if (!sid) throw new Error('Sin sesión activa');
    const http = await this.http();
    try {
      // OpenWA usa POST /sessions/:id/logout (algunas versiones también
      // aceptan /stop). Probamos logout, si no existe, /stop.
      const { data } = await http.post(`/sessions/${sid}/logout`);
      await this.logs.write('info', 'openwa', `Logout sesión ${sid}`);
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        return this.stopSession(sid);
      }
      throw err;
    }
  }

  async registerWebhook(
    url: string,
    events: string[] = ['message.received'],
  ) {
    try {
      const sid = await this.getSessionId();
      if (!sid) throw new Error('Sin OPENWA_SESSION_ID configurado');
      const http = await this.http();
      const secret = process.env.WEBHOOK_SECRET;
      const hasSecret = !isPlaceholderWebhookSecret(secret);

      // Construye la URL final. Si tenemos secret, lo añadimos como ?token=
      // como FALLBACK por si la version de OpenWA no propaga `headers`.
      // Importante: comparamos la URL ya con token para no dejar duplicados.
      let finalUrl = url;
      if (hasSecret) {
        const sep = url.includes('?') ? '&' : '?';
        finalUrl = `${url}${sep}token=${encodeURIComponent(secret!)}`;
      }

      // Borra webhooks previos con la misma URL base (con o sin token)
      try {
        const existing = await this.listWebhooks();
        if (Array.isArray(existing)) {
          for (const w of existing) {
            const wUrl: string = w?.url || '';
            const baseMatch =
              wUrl === url ||
              wUrl === finalUrl ||
              wUrl.split('?')[0] === url.split('?')[0];
            if (baseMatch && w?.id) {
              await http.delete(`/sessions/${sid}/webhooks/${w.id}`);
            }
          }
        }
      } catch {}

      const body: any = { url: finalUrl, events };
      if (hasSecret) {
        // OpenWA reenvía estas cabeceras al llamar a nuestro endpoint
        body.headers = { 'x-webhook-secret': secret };
      }

      const { data } = await http.post(`/sessions/${sid}/webhooks`, body);
      await this.logs.write(
        'info',
        'openwa',
        `Webhook registrado: ${url}`,
        { events, withSecret: hasSecret },
      );
      return data;
    } catch (err) {
      await this.logs.write(
        'error',
        'openwa',
        `Error registrando webhook: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async listRecentMessages(limit = 20): Promise<any[]> {
    try {
      const sid = await this.getSessionId();
      if (!sid) return [];
      const http = await this.http();
      const { data } = await http.get(`/sessions/${sid}/messages`, {
        params: { limit },
      });
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.messages)) return data.messages;
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Detecta el error "Session 'xxx' is not active" devuelto por OpenWA
   * cuando la sesión se ha quedado dormida.
   */
  private isSessionInactiveError(msg: string | undefined): boolean {
    if (!msg) return false;
    return /session\s+'[^']+'\s+is\s+not\s+active/i.test(msg) ||
      /start\s+the\s+session\s+first/i.test(msg);
  }

  async sendText(chatId: string, text: string) {
    // 🪪 Firma invisible: cada mensaje del bot lleva esta marca al inicio.
    const signed = `${OpenWaService.BOT_SIGNATURE}${text}`;

    const doSend = async () => {
      const sid = await this.getSessionId();
      if (!sid) throw new Error('Sin OPENWA_SESSION_ID configurado');
      const http = await this.http();
      const { data } = await http.post(
        `/sessions/${sid}/messages/send-text`,
        { chatId, text: signed },
      );
      return data;
    };

    let data: any;
    try {
      data = await doSend();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message;
      // Auto-recovery: si la sesión está inactiva, la arrancamos y
      // reintentamos UNA vez. Si vuelve a fallar, propagamos.
      if (this.isSessionInactiveError(msg)) {
        this.logger.warn(
          `Session inactiva al enviar a ${chatId}. Intentando startSession y reintento...`,
        );
        await this.logs.write(
          'warn',
          'openwa',
          `Session inactiva, auto-start y reintento -> ${chatId}`,
        );
        try {
          await this.startSession();
        } catch (startErr: any) {
          await this.logs.write(
            'error',
            'openwa',
            `Auto-start session fallo: ${startErr?.response?.data?.message || startErr.message}`,
          );
        }
        // Espera breve para que OpenWA termine de inicializar.
        await new Promise((r) => setTimeout(r, 2000));
        try {
          data = await doSend();
        } catch (retryErr: any) {
          const retryMsg =
            retryErr?.response?.data?.message || retryErr.message;
          await this.logs.write(
            'error',
            'openwa',
            `Reintento tras auto-start fallo enviando a ${chatId}: ${retryMsg}`,
          );
          throw new Error(retryMsg);
        }
      } else {
        await this.logs.write('error', 'openwa', `Error enviando a ${chatId}: ${msg}`);
        throw new Error(msg);
      }
    }

    // Defensa extra: tracking por messageId
    const msgId = data?.id || data?.messageId || data?.key?.id || data?.data?.id;
    if (msgId) {
      try {
        await this.redis.client.set(`wa:ownsent:${msgId}`, '1', 'EX', 3600);
      } catch {}
    }
    // Defensa extra: dedup por contenido (usando el texto FIRMADO)
    await this.markAsSent(chatId, signed);

    await this.logs.write('info', 'openwa', `→ ${chatId}: ${text.slice(0, 80)}`);
    return data;
  }
}
