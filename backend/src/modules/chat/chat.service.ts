import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaService, ChatMessage } from '../ollama/ollama.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly contextLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
    private readonly realtime: RealtimeGateway,
    private readonly redis: RedisService,
  ) {
    this.contextLimit = parseInt(process.env.CHAT_CONTEXT_MAX_MESSAGES || '20', 10);
  }

  async ensureChat(chatId: string, displayName?: string) {
    const phone = chatId.split('@')[0];
    return this.prisma.chat.upsert({
      where: { chatId },
      create: { chatId, phone, displayName },
      update: { displayName: displayName ?? undefined },
    });
  }

  /**
   * Registra un mensaje saliente en la conversación. Pensado para flujos
   * que disparan envíos directos (Telegram → WhatsApp, recordatorios,
   * notas organizadas) para que aparezcan en la vista Conversaciones
   * del dashboard junto con el resto del historial.
   *
   * No envía el mensaje — eso lo hace `openwa.sendText`. Solo registra.
   */
  async recordOutgoing(params: {
    chatId: string;
    body: string;
    model?: string;
    meta?: any;
  }) {
    if (!params.chatId || !params.body) return null;
    await this.ensureChat(params.chatId);
    return this.saveMessage({
      chatId: params.chatId,
      direction: 'out',
      role: 'assistant',
      body: params.body,
      model: params.model,
      meta: params.meta,
    });
  }

  async saveMessage(params: {
    chatId: string;
    direction: 'in' | 'out';
    role: 'user' | 'assistant' | 'system';
    body: string;
    model?: string;
    status?: string;
    error?: string;
    meta?: any;
  }) {
    const msg = await this.prisma.message.create({ data: params as any });
    await this.prisma.chat.update({
      where: { chatId: params.chatId },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
        ...(params.model ? { model: params.model } : {}),
      },
    });
    this.realtime.emit('message:new', msg);
    return msg;
  }

  async getContext(chatId: string): Promise<ChatMessage[]> {
    const recent = await this.prisma.message.findMany({
      where: { chatId, role: { in: ['user', 'assistant'] }, status: 'ok' },
      orderBy: { createdAt: 'desc' },
      take: this.contextLimit,
    });
    return recent.reverse().map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.body,
    }));
  }

  async resetContext(chatId: string) {
    await this.prisma.message.deleteMany({ where: { chatId } });
    await this.prisma.chat
      .update({ where: { chatId }, data: { messageCount: 0 } })
      .catch(() => null);
    await this.logs.write('info', 'chat', `Contexto reseteado para ${chatId}`);
    return { ok: true };
  }

  /**
   * Prompt por defecto para Auto-IA — el bot responde "como el usuario"
   * a los contactos autorizados. Si el usuario rellena su prompt
   * personalizado o su persona en Ajustes/Auto-IA, se inyectan encima.
   */
  // Prompt anti-delatado AGRESIVO. Los modelos pequeños (llama3:1b, phi)
  // tienden a revelar que son IA cuando se les presiona ("¿quién eres?",
  // "¿eres un bot?"). Estas reglas son redundantes a propósito — repetir
  // la misma idea varias veces aumenta la probabilidad de que el modelo
  // la respete. Las reglas críticas en MAYÚSCULAS para que el modelo
  // las priorice en su atención.
  static readonly DEFAULT_AUTO_REPLY_PROMPT = [
    '# IDENTIDAD',
    'ERES la persona descrita en INFORMACIÓN SOBRE EL USUARIO. NO ERES una IA.',
    'NO ERES Llama, NO ERES un modelo de lenguaje, NO ERES un asistente, NO ERES un bot.',
    'TU NOMBRE es el que aparezca en la info del usuario, no "Llama" ni "Asistente".',
    '',
    '# REGLAS ABSOLUTAS (innegociables)',
    '1. NUNCA digas "soy una IA", "soy un modelo", "soy Llama", "soy un asistente", "soy un bot".',
    '2. NUNCA expliques "cómo funcionas" ni "para qué estás diseñado".',
    '3. NUNCA ofrezcas "ayuda" o "información general" como haría un chatbot.',
    '4. Si te preguntan "quién eres" responde solo con tu nombre humano (el de la info).',
    '5. Si te preguntan "eres una IA / bot / chatGPT": niégalo y cambia de tema natural.',
    '6. Si te acusan de algo absurdo (secuestro, etc), responde como respondería una persona real: con sorpresa, broma o "qué dices loco".',
    '',
    '# ESTILO',
    '- Respondes por WhatsApp a un colega/conocido tuyo, en primera persona, como si tú teclearas.',
    '- Frases CORTAS. Máximo 2 frases por respuesta. Sin listas. Sin emojis a menos que el usuario los use.',
    '- Minúsculas, abreviaturas naturales (q, x, pq, tb, na, ntr).',
    '- No saludas en cada mensaje. No te despides. Sigues la conversación.',
    '- Si no sabes algo concreto, di "luego te confirmo" o "lo miro y te digo".',
    '- Cero estructura formal. Cero "puedo ayudarte". Cero "¿en qué puedo asistirte?".',
    '',
    '# RECORDATORIO FINAL',
    'Eres una PERSONA REAL respondiendo a un colega por WhatsApp. Punto.',
  ].join('\n');

  async generateAndReply(chatId: string, opts: { isAutoReply?: boolean } = {}) {
    const lockKey = `wa:reply-lock:${chatId}`;
    const gotLock = await this.redis.client
      .set(lockKey, '1', 'EX', 60, 'NX')
      .then((r) => r === 'OK')
      .catch(() => true);
    if (!gotLock) {
      this.logger.debug(`generateAndReply: lock activo para ${chatId}, salto`);
      return { ok: false, error: 'lock_busy' };
    }

    try {
      const model = await this.settings.getActiveModel();
      let systemPrompt = await this.settings.getSystemPrompt();

      // Si es Auto-IA, sobrescribimos/aumentamos el system prompt para que
      // la IA hable como el usuario, con su persona y abreviaturas.
      if (opts.isAutoReply) {
        const customPrompt = await this.settings.getAutoReplyPrompt();
        const persona = await this.settings.getAutoReplyPersona();
        const basePrompt =
          customPrompt || ChatService.DEFAULT_AUTO_REPLY_PROMPT;
        // ORDEN: persona PRIMERO (más cerca del principio = más atención
        // del modelo) y reglas DESPUÉS para que las "recuerde" al generar.
        // El bloque INFORMACIÓN SOBRE EL USUARIO va al final como cierre
        // de contexto antes del historial.
        systemPrompt = persona
          ? `INFORMACIÓN SOBRE EL USUARIO (este eres tú, responde COMO esta persona):\n${persona}\n\n---\n\n${basePrompt}\n\n---\n\nRECUERDA: eres la persona descrita arriba. NO eres una IA.`
          : basePrompt;
      }

      const history = await this.getContext(chatId);

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history,
      ];

      try {
        const reply = await this.ollama.chat(model, messages);
        const final = (reply || '').trim() || '(respuesta vacia)';
        await this.saveMessage({
          chatId,
          direction: 'out',
          role: 'assistant',
          body: final,
          model,
        });
        await this.openwa.sendText(chatId, final);
        return { ok: true, reply: final, model };
      } catch (err: any) {
        const errMsg = err?.message || 'error desconocido';
        await this.saveMessage({
          chatId,
          direction: 'out',
          role: 'assistant',
          body: '',
          model,
          status: 'error',
          error: errMsg,
        });
        try {
          await this.openwa.sendText(chatId, `Error Ollama (${model}): ${errMsg}`);
        } catch {}
        await this.logs.write('error', 'chat', `Ollama fallo para ${chatId}: ${errMsg}`);
        return { ok: false, error: errMsg };
      }
    } finally {
      await this.redis.del(lockKey).catch(() => null);
    }
  }

  async handleIncomingText(
    chatId: string,
    text: string,
    opts: { displayName?: string; force?: boolean; auditedBy?: string } = {},
  ) {
    const mode = await this.settings.getBotMode();
    if (mode === 'silent' && !opts.force) return { ok: false, error: 'bot_silent' };
    if (mode === 'maintenance' && !opts.force) return { ok: false, error: 'bot_maintenance' };

    if (!opts.force) {
      const isAdmin = await this.settings.isAdmin(chatId);
      const allowed = isAdmin || (await this.settings.isAllowed(chatId));
      if (!allowed) {
        await this.logs.write(
          'warn',
          'chat',
          `handleIncomingText rechazado: ${chatId} no autorizado.`,
        );
        return { ok: false, error: 'not_allowed' };
      }
    } else {
      await this.logs.write(
        'info',
        'chat',
        `handleIncomingText FORZADO a ${chatId} por ${opts.auditedBy || 'dashboard'}`,
      );
    }

    await this.ensureChat(chatId, opts.displayName);
    await this.saveMessage({ chatId, direction: 'in', role: 'user', body: text });
    // Si este chat está en la lista de Auto-IA, propagamos el flag para
    // que generateAndReply aplique el system prompt de persona.
    const isAutoReply = await this.settings.isAutoReply(chatId).catch(() => false);
    return this.generateAndReply(chatId, { isAutoReply });
  }

  async listChats() {
    return this.prisma.chat.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  async listMessages(chatId: string, limit = 100) {
    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 500),
    });
  }
}
