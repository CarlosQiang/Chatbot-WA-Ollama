import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { LogsService } from '../logs/logs.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class OpenWaService {
  private readonly logger = new Logger(OpenWaService.name);
  private http: AxiosInstance;
  private readonly sessionId: string;
  // TTL del dedup de "mensajes propios" en segundos
  private readonly ECHO_TTL_SEC = 60;

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
  ) {
    this.sessionId = process.env.OPENWA_SESSION_ID;
    this.http = axios.create({
      baseURL: process.env.OPENWA_API_URL,
      timeout: 30_000,
      headers: {
        'x-api-key': process.env.OPENWA_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });
  }

  getSessionId() {
    return this.sessionId;
  }

  getBotPhone() {
    return process.env.OPENWA_SESSION_PHONE || '';
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
    try {
      const { data } = await this.http.get('/health');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async ready() {
    try {
      const { data } = await this.http.get('/health/ready');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async stats() {
    try {
      const { data } = await this.http.get('/stats/overview');
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async listSessions() {
    const { data } = await this.http.get('/sessions');
    return data;
  }

  async getSession(id = this.sessionId) {
    try {
      const { data } = await this.http.get(`/sessions/${id}`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async startSession(id = this.sessionId) {
    const { data } = await this.http.post(`/sessions/${id}/start`);
    return data;
  }

  async stopSession(id = this.sessionId) {
    const { data } = await this.http.post(`/sessions/${id}/stop`);
    return data;
  }

  async getQr(id = this.sessionId) {
    try {
      const { data } = await this.http.get(`/sessions/${id}/qr`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async listWebhooks(id = this.sessionId) {
    try {
      const { data } = await this.http.get(`/sessions/${id}/webhooks`);
      return data;
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async registerWebhook(
    url: string,
    events: string[] = ['message.received', 'message.sent'],
  ) {
    try {
      // Borra webhooks previos con la misma URL
      try {
        const existing = await this.listWebhooks();
        if (Array.isArray(existing)) {
          for (const w of existing) {
            if (w?.url === url && w?.id) {
              await this.http.delete(`/sessions/${this.sessionId}/webhooks/${w.id}`);
            }
          }
        }
      } catch {}

      const { data } = await this.http.post(`/sessions/${this.sessionId}/webhooks`, {
        url,
        events,
      });
      await this.logs.write('info', 'openwa', `Webhook registrado: ${url}`, { events });
      return data;
    } catch (err) {
      await this.logs.write('error', 'openwa', `Error registrando webhook: ${(err as Error).message}`);
      throw err;
    }
  }

  async listRecentMessages(limit = 20): Promise<any[]> {
    try {
      const { data } = await this.http.get(`/sessions/${this.sessionId}/messages`, {
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

  async sendText(chatId: string, text: string) {
    try {
      // 🪪 Firma invisible: cada mensaje del bot lleva esta marca al inicio.
      const signed = `${OpenWaService.BOT_SIGNATURE}${text}`;

      const { data } = await this.http.post(
        `/sessions/${this.sessionId}/messages/send-text`,
        { chatId, text: signed },
      );

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
    } catch (err: any) {
      const msg = err?.response?.data?.message || err.message;
      await this.logs.write('error', 'openwa', `Error enviando a ${chatId}: ${msg}`);
      throw new Error(msg);
    }
  }
}
