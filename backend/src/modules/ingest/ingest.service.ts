import { Injectable, Logger } from '@nestjs/common';
import { ChatService } from '../chat/chat.service';
import { CommandService } from '../command/command.service';
import { OpenWaService } from '../openwa/openwa.service';
import { LogsService } from '../logs/logs.service';
import { SettingsService } from '../settings/settings.service';
import { IntentService } from '../intent/intent.service';
import { PendingContactsService } from './pending-contacts.service';
import { normalizeChatId } from '../../common/validators';

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
    private readonly pending: PendingContactsService,
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
      // En WhatsApp moderno (Baileys/OpenWA), cuando `chatId` viene como
      // `@lid`, OpenWA frecuentemente incluye el TELÉFONO real en otro
      // campo del payload. Capturamos todos los candidatos posibles y
      // luego el ingest se queda con el primero que sea un teléfono
      // válido (no otro lid). Esto permite que el usuario meta solo el
      // teléfono en la lista Auto-IA y el sistema haga match automático
      // sin tener que cazar el `@lid` opaco.
      senderCandidates: [
        p.senderPn,
        p.senderPhone,
        p.senderJid,
        p.participantPn,
        p.participant,
        p.author,
        p.contact?.id?._serialized,
        p.contact?.number,
        p.key?.participant,
        p.key?.participantPn,
        p.contextInfo?.participant,
        p.message?.key?.participant,
      ].filter((x) => typeof x === 'string' && x.length > 0),
    };
  }

  async ingest(payload: any): Promise<IngestResult> {
    try {
      const { id, chatId, text, fromMe, direction, displayName, senderCandidates } =
        this.extract(payload);

      // Diagnóstico: si llega un @lid y nuestro extractor NO capturó
      // ningún sender candidate, loggeamos las claves del payload para
      // descubrir si OpenWA está poniendo el teléfono en un campo que
      // todavía no conocemos. Esto se ve UNA SOLA VEZ por payload-shape
      // gracias al dedupe de message_id en el ingest.
      if (
        chatId &&
        chatId.endsWith('@lid') &&
        (!senderCandidates || senderCandidates.length === 0)
      ) {
        try {
          const p = payload?.data || payload?.message || payload || {};
          const topKeys = Object.keys(p).sort().join(',');
          const sample: Record<string, any> = {};
          for (const k of Object.keys(p)) {
            const v = (p as any)[k];
            // Solo guardamos primitivas y strings cortos — sin recursos pesados.
            if (typeof v === 'string' && v.length < 80) sample[k] = v;
            else if (typeof v === 'number' || typeof v === 'boolean') sample[k] = v;
            else if (v && typeof v === 'object' && !Array.isArray(v)) {
              sample[k] = `<obj keys=${Object.keys(v).slice(0, 6).join(',')}>`;
            }
          }
          await this.logs.write(
            'debug',
            'webhook',
            `[payload-shape] ${chatId} keys=${topKeys} sample=${JSON.stringify(sample)}`,
          );
        } catch {}
      }

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
      const isCmd = this.command.isCommand(text);

      // WhatsApp moderno entrega muchos chatIds como `@lid` (LinkedId,
      // opaco). El usuario solo conoce números de teléfono, así que
      // intentamos derivar el teléfono real desde varios sitios y
      // comprobamos Auto-IA / whitelist contra TODAS las variantes:
      //   1) el chatId tal cual (puede ser `@lid` o `@c.us`)
      //   2) el teléfono extraído del payload (senderPn, participant, etc.)
      //   3) el teléfono resuelto por OpenWA (cache 7d, suele fallar pero
      //      útil cuando funciona)
      // De esta forma, si el usuario mete el TELÉFONO en la lista y el
      // payload del webhook trae el teléfono, hace match automático sin
      // exigirle cazar el `@lid` opaco.
      let phoneChatId: string | null = chatId.endsWith('@lid') ? null : chatId;

      // Candidatos del payload: nos quedamos con el primer phone-based
      // válido (descartamos `@lid` repetidos).
      if (!phoneChatId && senderCandidates && senderCandidates.length) {
        for (const c of senderCandidates) {
          const n = normalizeChatId(c);
          if (n && n.endsWith('@c.us') && n !== chatId) {
            phoneChatId = n;
            this.logger.log(
              `[ingest] ${chatId}: teléfono detectado en payload -> ${phoneChatId}`,
            );
            // Cachea el mapeo para que el resolver lo encuentre sin
            // tener que volver a leer el payload — esto sirve también
            // para futuras llamadas a settings.isAdmin/isAllowed.
            await this.openwa
              .cacheLidMapping(chatId, phoneChatId)
              .catch(() => null);
            break;
          }
        }
      }

      // Fallback al resolver de OpenWA (probará el cache primero).
      if (!phoneChatId && chatId.endsWith('@lid')) {
        phoneChatId = await this.openwa
          .resolveContactPhone(chatId)
          .catch(() => null);
      }

      const aliases = [chatId];
      if (phoneChatId && phoneChatId !== chatId) aliases.push(phoneChatId);

      const isAdmin =
        (await this.settings.isAdmin(chatId)) ||
        (phoneChatId ? await this.settings.isAdmin(phoneChatId) : false);
      // Calculamos Auto-IA cuanto antes: este flag prevalece sobre whitelist
      // y sobre el modo `manual` (no sobre maintenance, que es estado de
      // silenciado intencional). `silent` SÍ lo bypassa Auto-IA: es el caso
      // de "estoy en examen, responde por mí a estos contactos".
      const isAutoTarget =
        (await this.settings.isAutoReply(chatId)) ||
        (phoneChatId ? await this.settings.isAutoReply(phoneChatId) : false);
      const isWhitelisted =
        (await this.settings.isAllowed(chatId)) ||
        (phoneChatId ? await this.settings.isAllowed(phoneChatId) : false);

      // Log estructurado: si algo no responde, este log lo explica todo a
      // la primera. Mostramos el `@lid` y el phone resuelto para que se
      // vea sin tener que mirar `docker logs`.
      const aliasLabel =
        phoneChatId && phoneChatId !== chatId
          ? `${chatId} (phone=${phoneChatId})`
          : chatId;
      this.logger.log(
        `[ingest] ${aliasLabel} text="${text.slice(0, 40)}" mode=${mode} ` +
          `isAdmin=${isAdmin} isCmd=${isCmd} isAutoTarget=${isAutoTarget} ` +
          `isWhitelisted=${isWhitelisted}`,
      );
      await this.logs.write(
        'debug',
        'webhook',
        `<- ${aliasLabel} mode=${mode} admin=${isAdmin} autoIA=${isAutoTarget} ` +
          `whitelist=${isWhitelisted} cmd=${isCmd} text="${text.slice(0, 60)}"`,
      );

      // Modo silent = "no respondo a nadie". PERO Auto-IA tiene que seguir
      // respondiendo a su lista: el caso de uso real es "estoy en examen,
      // que el bot conteste por mí a estos contactos específicos". Si silent
      // bloquease también Auto-IA, la feature sería inútil en su escenario
      // principal. Maintenance sí bloquea Auto-IA porque es modo operacional
      // (cambios de config, ollama caído, etc.).
      if (mode === 'silent' && !isAutoTarget) {
        this.logger.debug(`[ingest] descartado ${chatId}: modo silent (no Auto-IA)`);
        await this.logs.write('debug', 'webhook', `[silent] <- ${chatId}: ${text.slice(0, 60)}`);
        return { ok: true, ignored: 'silent' };
      }
      if (mode === 'silent' && isAutoTarget) {
        this.logger.log(`[ingest] ${chatId}: silent OVERRIDE por Auto-IA`);
        await this.logs.write(
          'info',
          'webhook',
          `[silent+AUTO-IA] <- ${chatId}: respondo igual porque está en lista Auto-IA`,
        );
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
        // Log friendly: incluye displayName, el chatId crudo y el TELÉFONO
        // resuelto si lo tenemos. El usuario solo necesita pegar el número
        // (sin sufijo, con +, espacios, da igual) en Ajustes → Auto-IA;
        // el sistema lo normaliza y matchea contra el lid en la siguiente
        // recepción gracias a resolveContactPhone.
        const who = displayName ? `"${displayName}"` : 'sin nombre';
        const pasteable = phoneChatId
          ? phoneChatId.replace(/@c\.us$/, '')
          : chatId;
        this.logger.log(
          `[ingest] descartado ${aliasLabel} (${who}): NO permitido (whitelist)`,
        );
        await this.logs.write(
          'warn',
          'webhook',
          `<- ${aliasLabel} ${who}: NO permitido. ` +
            `Abre Dashboard → Pendientes para añadirlo con un click. ` +
            `(O pega "${pasteable}" en Ajustes → Auto-IA). ` +
            `Texto: "${text.slice(0, 60)}"`,
        );
        // Lo registramos como pendiente para que aparezca en el dashboard
        // con su texto y nombre. El usuario lo añade con un click sin
        // tener que tocar logs ni IDs opacos. Ignoramos newsletter y otros
        // canales no-1to1 — no son contactos de WhatsApp normales.
        if (!chatId.endsWith('@newsletter') && !chatId.endsWith('@g.us')) {
          await this.pending.track({ chatId, displayName, text });
        }
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
