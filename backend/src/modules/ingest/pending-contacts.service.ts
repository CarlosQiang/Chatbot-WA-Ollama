import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

/**
 * "Pendientes" = contactos que han escrito al bot pero NO están en
 * Auto-IA, whitelist, ni admins. Los acumulamos en Redis para que el
 * dashboard pueda mostrarlos y permitir añadirlos con un click,
 * sin que el usuario tenga que ver logs ni copiar `@lid` opacos.
 *
 * Estructura en Redis:
 *  - ZSET `wa:pending:set`  -> score = timestamp ms, member = chatId
 *  - HASH `wa:pending:meta:<chatId>` -> { displayName, lastText, lastAt }
 *
 * TTL del set entero: 7 días. Los hashes individuales heredan TTL del
 * set por refresh en cada track().
 *
 * Cuando el usuario añade un chatId a Auto-IA, lo retiramos del set
 * para que la lista solo muestre lo REALMENTE pendiente.
 */
@Injectable()
export class PendingContactsService {
  private readonly logger = new Logger(PendingContactsService.name);
  private readonly ZSET_KEY = 'wa:pending:set';
  private readonly META_PREFIX = 'wa:pending:meta:';
  private readonly TTL_SEC = 7 * 24 * 3600;
  private readonly MAX_ENTRIES = 50;

  constructor(private readonly redis: RedisService) {}

  /**
   * Registra un contacto pendiente. Si ya estaba, actualiza el texto y
   * timestamp (el dashboard verá el último mensaje, no el primero).
   * No-op si chatId vacío.
   */
  async track(params: {
    chatId: string;
    displayName?: string;
    text?: string;
  }) {
    const { chatId, displayName, text } = params;
    if (!chatId) return;
    const now = Date.now();
    try {
      await this.redis.client.zadd(this.ZSET_KEY, now, chatId);
      await this.redis.client.expire(this.ZSET_KEY, this.TTL_SEC);

      const metaKey = `${this.META_PREFIX}${chatId}`;
      await this.redis.client.hset(metaKey, {
        chatId,
        displayName: displayName || '',
        lastText: (text || '').slice(0, 200),
        lastAt: String(now),
      });
      await this.redis.client.expire(metaKey, this.TTL_SEC);

      // Recorta el set a MAX_ENTRIES más recientes (los más antiguos se
      // descartan). zremrangebyrank quita por rango ascendente; -N..-1
      // dejaría los N más altos (recientes).
      await this.redis.client.zremrangebyrank(
        this.ZSET_KEY,
        0,
        -this.MAX_ENTRIES - 1,
      );
    } catch (err) {
      this.logger.warn(
        `pending track(${chatId}) falló: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Marca un chatId como atendido (lo quita de la lista de pendientes).
   * Se llama desde el endpoint POST /settings/autoreply/add cuando el
   * usuario añade el contacto.
   */
  async dismiss(chatId: string) {
    if (!chatId) return;
    try {
      await this.redis.client.zrem(this.ZSET_KEY, chatId);
      await this.redis.client.del(`${this.META_PREFIX}${chatId}`);
    } catch (err) {
      this.logger.warn(
        `pending dismiss(${chatId}) falló: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Lista pendientes ordenados por más reciente. Útil para el dashboard.
   */
  async list(limit = 50): Promise<
    Array<{
      chatId: string;
      displayName: string;
      lastText: string;
      lastAt: number;
    }>
  > {
    try {
      const max = Math.min(Math.max(1, limit), this.MAX_ENTRIES);
      // zrevrange = orden desc por score (timestamp).
      const ids: string[] = await this.redis.client.zrevrange(
        this.ZSET_KEY,
        0,
        max - 1,
      );
      const out: Array<{
        chatId: string;
        displayName: string;
        lastText: string;
        lastAt: number;
      }> = [];
      for (const id of ids) {
        const meta = await this.redis.client.hgetall(
          `${this.META_PREFIX}${id}`,
        );
        if (!meta || !meta.chatId) {
          // Huérfano en el set sin meta (TTL distinto) — lo limpiamos.
          await this.redis.client.zrem(this.ZSET_KEY, id);
          continue;
        }
        out.push({
          chatId: meta.chatId,
          displayName: meta.displayName || '',
          lastText: meta.lastText || '',
          lastAt: parseInt(meta.lastAt || '0', 10),
        });
      }
      return out;
    } catch (err) {
      this.logger.warn(`pending list() falló: ${(err as Error).message}`);
      return [];
    }
  }

  async clear() {
    try {
      const ids: string[] = await this.redis.client.zrange(
        this.ZSET_KEY,
        0,
        -1,
      );
      const pipeline = this.redis.client.pipeline();
      pipeline.del(this.ZSET_KEY);
      for (const id of ids) pipeline.del(`${this.META_PREFIX}${id}`);
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`pending clear() falló: ${(err as Error).message}`);
    }
  }
}
