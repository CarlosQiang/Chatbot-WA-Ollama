import { Injectable, Logger } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { CommandService } from '../command/command.service';
import { OpenWaService } from '../openwa/openwa.service';
import { LogsService } from '../logs/logs.service';
import { SettingsService } from '../settings/settings.service';
import { IntentService } from '../intent/intent.service';

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
    private readonly intent: IntentService,
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
      if (chatId.endsWith('@g.us')) {
        this.logger.debug(`[ingest] descartado ${chatId}: grupo`);
        return { ok: true, ignored: 'group' };
      }

      // Detectar SELF-CHAT: usuario escribiendose a su propio numero (chatId == botPhone).
      // En self-chat, OpenWA marca TODOS los mensajes como outgoing/fromMe porque
      // el origen y destino es el mismo numero. Solo descartamos los que tienen
      // la firma invisible del bot (las respuestas del bot a su propio chat).
      const botPhone = (process.env.OPENWA_SESSION_PHONE || '').replace(/\D/g, '');
      const isSelfChat = !!botPhone && chatId === `${botPhone}@c.us`;

      if (isBotSigned(text)) {
        this.logger.debug(`[ingest] descartado ${chatId}: firma bot (self-echo)`);
        return { ok: true, ignored: 'self-echo' };
      }

      if (!isSelfChat && direction === 'outgoing') {
        this.logger.debug(
          `[ingest] descartado ${chatId}: direction=outgoing y no es self-chat`,
        );
        return { ok: true, ignored: 'self-echo' };
      }

      if (id && (await this.openwa.isOwnMessage(id))) {
        this.logger.debug(`[ingest] descartado ${chatId}: own-message id=${id}`);
        return { ok: true, ignored: 'self-echo' };
      }

      if (id) {
        const isNew = await this.openwa.markMessageSeen(id);
        if (!isNew) {
          this.logger.debug(`[ingest] descartado ${chatId}: dedup id=${id}`);
          return { ok: true, ignored: 'duplicate' };
        }
      }

      if (fromMe) {
        const isEcho = await this.openwa.isOwnEcho(chatId, text);
        if (isEcho) {
          this.logger.debug(`[ingest] descartado ${chatId}: own-echo (fromMe)`);
          return { ok: true, ignored: 'self-echo' };
        }
      }

      const burst = await this.openwa.checkBurst(chatId);
      if (burst.tripped) {
        this.logger.warn(
          `[ingest] descartado ${chatId}: circuit breaker (${burst.count} msgs/30s)`,
        );
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
      // Calculamos Auto-IA cuanto antes: este flag prevalece sobre whitelist
      // y sobre el modo `manual` (no sobre silent/maintenance, que son
      // estados de silenciado intencional).
      const isAutoTarget = await this.settings.isAutoReply(chatId);
      const isWhitelisted = await this.settings.isAllowed(chatId);

      // Log estructurado y detallado: si algo no responde, este log lo explica
      // todo a la primera. Se publica también al panel "Logs" del dashboard
      // a nivel info para que se vea sin tener que mirar `docker logs`.
      this.logger.log(
        `[ingest] ${chatId} text="${text.slice(0, 40)}" mode=${mode} ` +
          `isAdmin=${isAdmin} isCmd=${isCmd} isAutoTarget=${isAutoTarget} ` +
          `isWhitelisted=${isWhitelisted}`,
      );
      await this.logs.write(
        'debug',
        'webhook',
        `<- ${chatId} mode=${mode} admin=${isAdmin} autoIA=${isAutoTarget} ` +
          `whitelist=${isWhitelisted} cmd=${isCmd} text="${text.slice(0, 60)}"`,
      );

      if (mode === 'silent') {
        this.logger.debug(`[ingest] descartado ${chatId}: modo silent`);
        await this.logs.write('debug', 'webhook', `[silent] <- ${chatId}: ${text.slice(0, 60)}`);
        return { ok: true, ignored: 'silent' };
      }

      if (mode === 'maintenance') {
        if (isAdmin) {
          this.logger.log(`[ingest] ${chatId}: aviso de mantenimiento (admin)`);
          await this.openwa.sendText(
            chatId,
            'Bot en modo mantenimiento. Usa /modo private o /modo ai para reactivar.',
          );
          return { ok: true, handled: 'maintenance' };
        }
        this.logger.debug(`[ingest] descartado ${chatId}: modo maintenance (no admin)`);
        return { ok: true, ignored: 'maintenance' };
      }

      const allowed = isAdmin || isAutoTarget || isWhitelisted;
      if (!allowed) {
        this.logger.log(`[ingest] descartado ${chatId}: NO permitido (whitelist)`);
        await this.logs.write(
          'warn',
          'webhook',
          `<- ${chatId}: NO permitido. Ni admin, ni Auto-IA, ni whitelist. ` +
            'Añade el número en Ajustes → Auto-IA (si quieres respuesta IA) ' +
            'o en Whitelist (modo private/ai).',
        );
        return { ok: true, ignored: 'not_allowed' };
      }

      // Modo manual = solo comandos de admins. PERO Auto-IA debe seguir
      // disparando respuesta IA aunque estemos en manual: la promesa del
      // toggle es "responde siempre con Ollama a este número".
      if (mode === 'manual' && !isAutoTarget) {
        if (!isCmd) {
          this.logger.debug(`[ingest] descartado ${chatId}: modo manual, sin comando`);
          await this.logs.write('debug', 'webhook', `[manual] sin comando, ignoro ${chatId}`);
          return { ok: true, ignored: 'manual_only' };
        }
        if (!isAdmin) {
          this.logger.debug(`[ingest] ${chatId}: modo manual, comando de no-admin`);
          await this.openwa.sendText(chatId, 'Bot en modo manual. Solo administradores.');
          return { ok: true, ignored: 'manual_only' };
        }
      }

      this.logger.log(
        `[ingest] aceptado ${chatId}: ${text.slice(0, 60)}` +
          (isAutoTarget ? ' [AUTO-IA]' : ''),
      );
      await this.logs.write('info', 'webhook', `<- ${chatId}: ${text.slice(0, 80)}`);
      await this.chat.ensureChat(chatId, displayName);
      await this.chat.saveMessage({
        chatId,
        direction: 'in',
        role: 'user',
        body: text,
      });

      if (isCmd) {
        // Admins pueden lanzar comandos incluso si son el target de Auto-IA.
        this.logger.debug(`[ingest] ${chatId}: comando "${text.slice(0, 40)}"`);
        await this.command.handle(chatId, text, { isAdmin });
        return { ok: true, handled: 'command' };
      }

      // Auto-IA: la promesa de la feature es "siempre con Ollama, ignorando
      // intents". Si el chatId es el target activo, saltamos el intent
      // detector para que un "recuerdame X" no se convierta en recordatorio
      // sino que vaya como mensaje normal a Ollama.
      if (!isAutoTarget) {
        // Detección de intención en lenguaje natural (recordatorios, notas, organizar)
        const intentResult = await this.intent.detect({
          text,
          source: 'whatsapp',
          sourceId: chatId,
          createdBy: `wa:${chatId}`,
        });
        if (intentResult.intent !== 'chat') {
          this.logger.debug(`[ingest] ${chatId}: intent=${intentResult.intent}`);
          await this.chat.saveMessage({
            chatId,
            direction: 'out',
            role: 'assistant',
            body: intentResult.reply,
            meta: { intent: intentResult.intent },
          });
          await this.openwa.sendText(chatId, intentResult.reply);
          return { ok: true, handled: 'chat' };
        }
      } else {
        this.logger.debug(`[ingest] ${chatId}: Auto-IA -> bypass intent, directo a Ollama`);
      }

      this.logger.debug(
        `[ingest] ${chatId}: -> Ollama (generateAndReply, isAutoReply=${isAutoTarget})`,
      );
      // FIX: pasamos isAutoReply para que ChatService aplique el system prompt
      // + persona de Auto-IA. Sin esto, el bot respondía con el system prompt
      // genérico aunque el contacto estuviese en la lista Auto-IA, ignorando
      // toda la configuración de "Cómo debe responder" y "Sobre ti".
      const reply = await this.chat.generateAndReply(chatId, {
        isAutoReply: isAutoTarget,
      });
      this.logger.debug(
        `[ingest] ${chatId}: generateAndReply ok=${reply?.ok} ` +
          (reply?.error ? `error="${reply.error}"` : ''),
      );
      if (!reply?.ok) {
        await this.logs.write(
          'error',
          'webhook',
          `-> ${chatId}: generateAndReply FALLO (${reply?.error || 'desconocido'}). ` +
            'Revisa Ollama (modelo activo, servidor online) o el lock Redis.',
        );
      }
      return { ok: true, handled: 'chat' };
    } catch (err: any) {
      this.logger.error(`[ingest] excepción: ${err.message}`, err.stack);
      await this.logs.write('error', 'webhook', `Ingest excepcion: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }
}
