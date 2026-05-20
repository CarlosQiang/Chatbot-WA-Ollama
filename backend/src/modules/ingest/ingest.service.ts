import { Injectable, Logger } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { CommandService } from '../command/command.service';
import { OpenWaService } from '../openwa/openwa.service';
import { LogsService } from '../logs/logs.service';
import { SettingsService } from '../settings/settings.service';

const BOT_SIGNATURE = '​‌​';
const isBotSigned = (t: string) =>
  typeof t === 'string' && t.startsWith(BOT_SIGNATURE);

export type IngestResult = {
  ok: boolean;
  handled?: 'command' | 'chat' | 'maintenance';
  ignored?:
    | 'no_text'
    | 'group'
    | 'self-echo'
    | 'not_allowed'
    | 'duplicate'
    | 'silent'
    | 'manual_only'
    | 'maintenance';
  error?: string;
};

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly chat: ChatService,
    private readonly command: CommandService,
    private readonly openwa: OpenWaService,
    private readonly logs: LogsService,
    private readonly settings: SettingsService,
  ) {}

  extract(payload: any) {
    const p = payload?.data || payload?.message || payload || {};
    const direction = p.direction || p.dir || (p.fromMe ? 'outgoing' : undefined);
    return {
      id: p.id || p.messageId || p.waMessageId || p.key?.id || null,
      chatId: p.chatId || p.from || p.chat?.id || p.key?.remoteJid || null,
      text:
        p.body ||
        p.text ||
        p.content ||
        p.message?.text ||
        p.message?.conversation ||
        p.message?.extendedTextMessage?.text ||
        null,
      fromMe: !!(p.fromMe || p.key?.fromMe || direction === 'outgoing'),
      direction,
      displayName: p.senderName || p.notifyName || p.pushName || p.author,
    };
  }

  async ingest(payload: any): Promise<IngestResult> {
    try {
      const { id, chatId, text, fromMe, direction, displayName } = this.extract(payload);

      // Detectar eventos de "envio confirmado" sin contenido y silenciarlos
      const eventType: string = payload?.event || payload?.type || '';
      const isAckEvent =
        eventType === 'message.sent' ||
        eventType === 'message.ack' ||
        direction === 'outgoing';

      if (!chatId || !text) {
        if (isAckEvent) {
          // No es ruido, es un ack — ignorar silenciosamente
          return { ok: true, ignored: 'no_text' };
        }
        await this.logs.write('debug', 'webhook', 'Payload sin chatId/text', { payload });
        return { ok: true, ignored: 'no_text' };
      }
      if (chatId.endsWith('@g.us')) return { ok: true, ignored: 'group' };

      if (direction === 'outgoing') return { ok: true, ignored: 'self-echo' };
      if (isBotSigned(text)) return { ok: true, ignored: 'self-echo' };

      if (id && (await this.openwa.isOwnMessage(id))) {
        return { ok: true, ignored: 'self-echo' };
      }

      if (id) {
        const isNew = await this.openwa.markMessageSeen(id);
        if (!isNew) return { ok: true, ignored: 'duplicate' };
      }

      if (fromMe) {
        const isEcho = await this.openwa.isOwnEcho(chatId, text);
        if (isEcho) return { ok: true, ignored: 'self-echo' };
      }

      const burst = await this.openwa.checkBurst(chatId);
      if (burst.tripped) {
        await this.logs.write(
          'warn',
          'webhook',
          `Circuit breaker ${chatId}: ${burst.count} msgs/30s. Descarto.`,
        );
        return { ok: true, ignored: 'self-echo' };
      }

      const mode = await this.settings.getBotMode();
      const isAdmin = await this.settings.isAdmin(chatId);
      const isCmd = this.command.isCommand(text);

      if (mode === 'silent') {
        await this.logs.write('debug', 'webhook', `[silent] <- ${chatId}: ${text.slice(0, 60)}`);
        return { ok: true, ignored: 'silent' };
      }

      if (mode === 'maintenance') {
        if (isAdmin) {
          await this.openwa.sendText(
            chatId,
            'Bot en modo mantenimiento. Usa /modo private o /modo ai para reactivar.',
          );
          return { ok: true, handled: 'maintenance' };
        }
        return { ok: true, ignored: 'maintenance' };
      }

      const isAutoTarget = await this.settings.isAutoReply(chatId);
      const allowed = isAdmin || isAutoTarget || (await this.settings.isAllowed(chatId));
      if (!allowed) {
        await this.logs.write('info', 'webhook', `<- ${chatId}: NO permitido (whitelist)`);
        return { ok: true, ignored: 'not_allowed' };
      }

      if (mode === 'manual') {
        if (!isCmd) {
          await this.logs.write('debug', 'webhook', `[manual] sin comando, ignoro ${chatId}`);
          return { ok: true, ignored: 'manual_only' };
        }
        if (!isAdmin) {
          await this.openwa.sendText(chatId, 'Bot en modo manual. Solo administradores.');
          return { ok: true, ignored: 'manual_only' };
        }
      }

      await this.logs.write('info', 'webhook', `<- ${chatId}: ${text.slice(0, 80)}`);
      await this.chat.ensureChat(chatId, displayName);
      await this.chat.saveMessage({
        chatId,
        direction: 'in',
        role: 'user',
        body: text,
      });

      if (isCmd) {
        await this.command.handle(chatId, text, { isAdmin });
        return { ok: true, handled: 'command' };
      }

      await this.chat.generateAndReply(chatId);
      return { ok: true, handled: 'chat' };
    } catch (err: any) {
      this.logger.error(err);
      await this.logs.write('error', 'webhook', `Ingest excepcion: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
