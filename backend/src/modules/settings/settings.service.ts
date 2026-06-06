import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeChatId, normalizeChatIdList } from '../../common/validators';

export const SETTING_KEYS = {
  ACTIVE_MODEL: 'active_model',
  SYSTEM_PROMPT: 'system_prompt',
  OLLAMA_BASE_URL: 'ollamaBaseUrl',
  OLLAMA_FALLBACK_URLS: 'ollamaFallbackUrls',
  TEST_WHATSAPP_CHAT_ID: 'testWhatsappChatId',
  ALLOWED_CHAT_IDS: 'allowedChatIds',
  ADMIN_CHAT_IDS: 'adminChatIds',
  AUTO_REPLY_ENABLED: 'autoReplyEnabled',
  /** @deprecated single-chatId legacy. Mantenido para migración runtime. */
  AUTO_REPLY_CHAT_ID: 'autoReplyChatId',
  /** Lista CSV de chatIds Auto-IA (formato canónico 34XXXXXXXXX@c.us). */
  AUTO_REPLY_CHAT_IDS: 'autoReplyChatIds',
  /**
   * chatId WhatsApp personal del usuario. Destino por defecto para
   * recordatorios y notas creados desde Telegram o dashboard.
   * Si está vacío, fallback al self-chat del bot (OPENWA_SESSION_PHONE@c.us).
   */
  PERSONAL_WA_CHAT_ID: 'personalWhatsappChatId',
  BOT_MODE: 'bot_mode',
  REMINDER_TZ: 'reminderTz',
  TG_BOT_TOKEN: 'tgBotToken',
  TG_ALLOWED_USER_IDS: 'tgAllowedUserIds',
  TG_BRIDGE_WA: 'tgBridgeWa',
  TG_BRIDGE_CHAT_ID: 'tgBridgeChatId',
  // ─── Proveedor IA (Ollama | OpenAI) ───────────────────────
  AI_PROVIDER: 'aiProvider', // 'ollama' | 'openai'
  AI_TEMPERATURE: 'aiTemperature',
  OPENAI_API_KEY: 'openaiApiKey',
  OPENAI_BASE_URL: 'openaiBaseUrl',
  OPENAI_MODEL: 'openaiModel',
  // ─── Prompts personalizables ──────────────────────────────
  NOTES_PROMPT: 'notesPrompt',
  REMINDERS_PROMPT: 'remindersPrompt',
  // ─── Recordatorios — parser IA fallback ───────────────────
  REMINDERS_AI_FALLBACK: 'remindersAiFallback', // 'true' | 'false'
  // ─── Auto-IA prompt personalizado ─────────────────────────
  AUTO_REPLY_PROMPT: 'autoReplyPrompt',
  AUTO_REPLY_PERSONA: 'autoReplyPersona',
  // ─── OpenWA dinámico (editable desde el dashboard) ────────
  OPENWA_API_URL: 'openwaApiUrl',
  OPENWA_API_KEY: 'openwaApiKey',
  OPENWA_SESSION_ID: 'openwaSessionId',
  OPENWA_SESSION_NAME: 'openwaSessionName',
  OPENWA_SESSION_PHONE: 'openwaSessionPhone',
} as const;

export type AiProvider = 'ollama' | 'openai';
export const AI_PROVIDERS: AiProvider[] = ['ollama', 'openai'];

export type BotMode = 'manual' | 'private' | 'ai' | 'silent' | 'maintenance';
export const BOT_MODES: BotMode[] = ['manual', 'private', 'ai', 'silent', 'maintenance'];

export const BOT_MODE_DESCRIPTIONS: Record<BotMode, string> = {
  manual: 'Solo procesa comandos enviados por administradores. Sin IA conversacional.',
  private: 'Procesa comandos y conversacion IA solo de la whitelist y los admins. Recomendado.',
  ai: 'Igual que privado, pensado para conversacion continua con Ollama.',
  silent: 'No responde a nada. Util para silenciar el bot sin pararlo.',
  maintenance: 'Modo mantenimiento: avisa a admins, ignora al resto.',
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const s = await this.prisma.setting.findUnique({ where: { key } });
    return s?.value ?? null;
  }

  async set(key: string, value: string, auditedBy?: string) {
    const prev = await this.get(key);
    const res = await this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    if (prev !== value) {
      this.logger.log(
        `setting "${key}" cambiado (${auditedBy || 'system'}): ${this.short(prev)} -> ${this.short(value)}`,
      );
    }
    return res;
  }

  private short(v: string | null): string {
    if (v === null) return 'null';
    return v.length > 40 ? v.slice(0, 40) + '...' : v;
  }

  async all() {
    return this.prisma.setting.findMany();
  }

  async getActiveModel(): Promise<string> {
    const v = await this.get(SETTING_KEYS.ACTIVE_MODEL);
    return v || process.env.OLLAMA_DEFAULT_MODEL || 'llama3';
  }

  async setActiveModel(model: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.ACTIVE_MODEL, model, auditedBy);
  }

  async getSystemPrompt(): Promise<string> {
    const v = await this.get(SETTING_KEYS.SYSTEM_PROMPT);
    return v || process.env.CHAT_SYSTEM_PROMPT || 'Eres un asistente util y conciso.';
  }

  async getOllamaBaseUrl(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OLLAMA_BASE_URL);
    if (saved) return saved;
    const env = process.env.OLLAMA_BASE_URL;
    if (env) return env;
    return 'http://host.docker.internal:11434';
  }

  async setOllamaBaseUrl(url: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OLLAMA_BASE_URL, url, auditedBy);
  }

  async getOllamaFallbackUrls(): Promise<string[]> {
    const saved = await this.get(SETTING_KEYS.OLLAMA_FALLBACK_URLS);
    const raw = saved ?? process.env.OLLAMA_FALLBACK_URLS ?? '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async setOllamaFallbackUrls(urls: string[], auditedBy?: string) {
    const cleaned = (urls || [])
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .filter((s, i, a) => a.indexOf(s) === i);
    return this.set(SETTING_KEYS.OLLAMA_FALLBACK_URLS, cleaned.join(','), auditedBy);
  }

  async getTestChatId(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.TEST_WHATSAPP_CHAT_ID);
    if (saved) return saved;
    return process.env.TEST_WHATSAPP_CHAT_ID || '34670209033@c.us';
  }

  async setTestChatId(chatId: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.TEST_WHATSAPP_CHAT_ID, chatId, auditedBy);
  }

  async getAllowedChatIds(): Promise<string[]> {
    const saved = await this.get(SETTING_KEYS.ALLOWED_CHAT_IDS);
    const raw = saved ?? process.env.ALLOWED_CHAT_IDS ?? '';
    return normalizeChatIdList(raw);
  }

  async setAllowedChatIds(ids: string[] | string, auditedBy?: string) {
    const cleaned = normalizeChatIdList(ids);
    return this.set(SETTING_KEYS.ALLOWED_CHAT_IDS, cleaned.join(','), auditedBy);
  }

  isOpenToAll(): boolean {
    return (process.env.OPEN_TO_ALL || '').toLowerCase() === 'true';
  }

  async isAllowed(chatId: string): Promise<boolean> {
    const list = await this.getAllowedChatIds();
    if (list.length === 0) return this.isOpenToAll();
    const incoming = normalizeChatId(chatId);
    if (!incoming) return false;
    return list.includes(incoming);
  }

  async addAllowed(chatId: string, auditedBy?: string) {
    const list = await this.getAllowedChatIds();
    const n = normalizeChatId(chatId);
    if (n && !list.includes(n)) list.push(n);
    return this.setAllowedChatIds(list, auditedBy);
  }

  async removeAllowed(chatId: string, auditedBy?: string) {
    const list = await this.getAllowedChatIds();
    const n = normalizeChatId(chatId);
    return this.setAllowedChatIds(list.filter((c) => c !== n), auditedBy);
  }

  async getAdminChatIds(): Promise<string[]> {
    const saved = await this.get(SETTING_KEYS.ADMIN_CHAT_IDS);
    const raw = saved ?? process.env.ADMIN_CHAT_IDS ?? '';
    const list = normalizeChatIdList(raw);

    const botPhone = (process.env.OPENWA_SESSION_PHONE || '').replace(/\D/g, '');
    if (botPhone) {
      const ownerChatId = `${botPhone}@c.us`;
      if (!list.includes(ownerChatId)) list.push(ownerChatId);
    }
    return list;
  }

  async setAdminChatIds(ids: string[] | string, auditedBy?: string) {
    const cleaned = normalizeChatIdList(ids);
    return this.set(SETTING_KEYS.ADMIN_CHAT_IDS, cleaned.join(','), auditedBy);
  }

  async isAdmin(chatId: string): Promise<boolean> {
    const list = await this.getAdminChatIds();
    const incoming = normalizeChatId(chatId);
    if (!incoming) return false;
    return list.includes(incoming);
  }

  async getBotMode(): Promise<BotMode> {
    const v = (await this.get(SETTING_KEYS.BOT_MODE)) as BotMode | null;
    if (v && BOT_MODES.includes(v)) return v;
    const env = (process.env.BOT_MODE_DEFAULT || '').toLowerCase() as BotMode;
    if (env && BOT_MODES.includes(env)) return env;
    return 'private';
  }

  async setBotMode(mode: BotMode, auditedBy?: string) {
    if (!BOT_MODES.includes(mode)) {
      throw new Error(`Modo invalido "${mode}". Validos: ${BOT_MODES.join(', ')}`);
    }
    return this.set(SETTING_KEYS.BOT_MODE, mode, auditedBy);
  }

  /**
   * Devuelve el estado de Auto-IA con la lista canónica de chatIds.
   * Migración runtime: si solo existe el legacy `autoReplyChatId` (single)
   * pero no la lista nueva, lo migra a la lista al primer acceso.
   */
  async getAutoReply(): Promise<{ enabled: boolean; chatIds: string[] }> {
    const en = await this.get(SETTING_KEYS.AUTO_REPLY_ENABLED);
    const csv = await this.get(SETTING_KEYS.AUTO_REPLY_CHAT_IDS);
    let chatIds = normalizeChatIdList(csv);

    if (chatIds.length === 0) {
      // Migración runtime del campo single legacy.
      const legacy = await this.get(SETTING_KEYS.AUTO_REPLY_CHAT_ID);
      if (legacy) {
        const n = normalizeChatId(legacy);
        if (n) {
          chatIds = [n];
          // Persiste la migración para no repetir.
          await this.set(SETTING_KEYS.AUTO_REPLY_CHAT_IDS, n, 'auto-migration');
        }
      }
    }

    return { enabled: en === 'true', chatIds };
  }

  /**
   * Guarda la configuración Auto-IA. `chatIds` puede llegar como array
   * o como string CSV (`"34X,+34Y, 34 Z"`); se normaliza y deduplica.
   * Si chatIds llega `undefined`, no se toca la lista (solo se guarda enabled).
   */
  /**
   * Añade UN chatId a la lista Auto-IA sin tocar el resto. Pensado para
   * el flujo "click en pendiente -> añadir". Si la feature Auto-IA estaba
   * deshabilitada, NO la habilita sola (decisión consciente del usuario).
   * El chatId se normaliza (acepta `@c.us`, `@lid`, teléfono crudo).
   * Si ya estaba, no duplica. Devuelve el estado actualizado.
   */
  async addAutoReply(chatId: string, auditedBy?: string) {
    const n = normalizeChatId(chatId);
    if (!n) {
      throw new Error(
        `chatId inválido: "${chatId}". Esperaba número, "<digits>@c.us" o "<digits>@lid".`,
      );
    }
    const current = await this.getAutoReply();
    if (current.chatIds.includes(n)) return current;
    const next = [...current.chatIds, n];
    await this.set(
      SETTING_KEYS.AUTO_REPLY_CHAT_IDS,
      next.join(','),
      auditedBy,
    );
    return this.getAutoReply();
  }

  async setAutoReply(
    enabled: boolean,
    chatIds?: string[] | string | null,
    auditedBy?: string,
  ) {
    await this.set(
      SETTING_KEYS.AUTO_REPLY_ENABLED,
      enabled ? 'true' : 'false',
      auditedBy,
    );
    if (chatIds !== undefined) {
      const cleaned = chatIds === null ? [] : normalizeChatIdList(chatIds);
      await this.set(
        SETTING_KEYS.AUTO_REPLY_CHAT_IDS,
        cleaned.join(','),
        auditedBy,
      );
      // Mantén el legacy en sync para que un downgrade no rompa nada.
      await this.set(
        SETTING_KEYS.AUTO_REPLY_CHAT_ID,
        cleaned[0] || '',
        auditedBy,
      );
    }
    return this.getAutoReply();
  }

  /**
   * Devuelve true si el chatId entrante está en la lista Auto-IA y la
   * feature está activa. Normaliza el chatId entrante para tolerar
   * variaciones de formato (mayúsculas, sufijo @s.whatsapp.net, etc).
   */
  async isAutoReply(chatId: string): Promise<boolean> {
    const { enabled, chatIds } = await this.getAutoReply();
    if (!enabled || chatIds.length === 0) return false;
    const incoming = normalizeChatId(chatId);
    if (!incoming) return false;
    return chatIds.includes(incoming);
  }

  /**
   * WhatsApp personal del usuario. Si no está configurado, fallback al
   * self-chat del bot. Es el destino "por defecto" para recordatorios y
   * notas creados desde Telegram o desde el dashboard.
   */
  async getPersonalWhatsappChatId(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.PERSONAL_WA_CHAT_ID);
    const normalized = saved ? normalizeChatId(saved) : null;
    if (normalized) return normalized;
    const botPhone = (process.env.OPENWA_SESSION_PHONE || '').replace(/\D/g, '');
    return botPhone ? `${botPhone}@c.us` : '';
  }

  async setPersonalWhatsappChatId(chatId: string, auditedBy?: string) {
    const cleaned = chatId.trim() === '' ? '' : normalizeChatId(chatId) || '';
    return this.set(SETTING_KEYS.PERSONAL_WA_CHAT_ID, cleaned, auditedBy);
  }

  async getReminderTz(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.REMINDER_TZ);
    if (saved) return saved;
    return process.env.REMINDER_TZ || process.env.TZ || 'Europe/Madrid';
  }

  async setReminderTz(tz: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.REMINDER_TZ, tz, auditedBy);
  }

  // ─── Telegram dinamico ─────────────────────────────────────
  async getTelegramBotToken(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.TG_BOT_TOKEN);
    return (saved || process.env.TELEGRAM_BOT_TOKEN || '').trim();
  }

  async setTelegramBotToken(token: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.TG_BOT_TOKEN, (token || '').trim(), auditedBy);
  }

  async getTelegramAllowedUserIds(): Promise<number[]> {
    const saved = await this.get(SETTING_KEYS.TG_ALLOWED_USER_IDS);
    const raw = saved ?? process.env.TELEGRAM_ALLOWED_USER_IDS ?? '';
    return raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
  }

  async setTelegramAllowedUserIds(ids: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.TG_ALLOWED_USER_IDS, (ids || '').trim(), auditedBy);
  }

  async getTelegramBridgeWa(): Promise<boolean> {
    const v = await this.get(SETTING_KEYS.TG_BRIDGE_WA);
    return v === 'true';
  }

  async setTelegramBridgeWa(enabled: boolean, auditedBy?: string) {
    return this.set(SETTING_KEYS.TG_BRIDGE_WA, enabled ? 'true' : 'false', auditedBy);
  }

  async getTelegramBridgeChatId(): Promise<string> {
    const v = await this.get(SETTING_KEYS.TG_BRIDGE_CHAT_ID);
    if (v) return v;
    return await this.getTestChatId();
  }

  async setTelegramBridgeChatId(chatId: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.TG_BRIDGE_CHAT_ID, chatId, auditedBy);
  }

  // ─── Proveedor IA ──────────────────────────────────────────
  /**
   * Proveedor IA activo. Si no está configurado en DB, lee la env
   * `AI_PROVIDER`; si tampoco existe, devuelve 'ollama' (default).
   * NO se rompe nada si el campo aún no existe en una instancia ya desplegada.
   */
  async getAiProvider(): Promise<AiProvider> {
    const saved = (await this.get(SETTING_KEYS.AI_PROVIDER)) as AiProvider | null;
    if (saved && AI_PROVIDERS.includes(saved)) return saved;
    const env = (process.env.AI_PROVIDER || '').toLowerCase() as AiProvider;
    if (env && AI_PROVIDERS.includes(env)) return env;
    return 'ollama';
  }

  async setAiProvider(provider: AiProvider, auditedBy?: string) {
    if (!AI_PROVIDERS.includes(provider)) {
      throw new Error(`Proveedor invalido "${provider}". Validos: ${AI_PROVIDERS.join(', ')}`);
    }
    return this.set(SETTING_KEYS.AI_PROVIDER, provider, auditedBy);
  }

  async getAiTemperature(): Promise<number> {
    const saved = await this.get(SETTING_KEYS.AI_TEMPERATURE);
    const raw = saved ?? process.env.AI_TEMPERATURE ?? '';
    const n = parseFloat(raw);
    if (isNaN(n) || n < 0 || n > 2) return 0.7;
    return n;
  }

  async setAiTemperature(temp: number, auditedBy?: string) {
    return this.set(SETTING_KEYS.AI_TEMPERATURE, String(temp), auditedBy);
  }

  // ─── OpenAI ────────────────────────────────────────────────
  async getOpenAiApiKey(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENAI_API_KEY);
    return (saved || process.env.OPENAI_API_KEY || '').trim();
  }

  async setOpenAiApiKey(key: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENAI_API_KEY, (key || '').trim(), auditedBy);
  }

  async getOpenAiBaseUrl(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENAI_BASE_URL);
    return (saved || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
  }

  async setOpenAiBaseUrl(url: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENAI_BASE_URL, (url || '').trim(), auditedBy);
  }

  async getOpenAiModel(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENAI_MODEL);
    return (saved || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
  }

  async setOpenAiModel(model: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENAI_MODEL, (model || '').trim(), auditedBy);
  }

  // ─── Prompts personalizables ───────────────────────────────
  /**
   * Prompt personalizado para organizar/limpiar notas. Si está vacío,
   * el servicio Notes usa el prompt por defecto (ligero, NO reinterpreta).
   */
  async getNotesPrompt(): Promise<string> {
    const v = await this.get(SETTING_KEYS.NOTES_PROMPT);
    return (v || '').trim();
  }

  async setNotesPrompt(prompt: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.NOTES_PROMPT, prompt || '', auditedBy);
  }

  /**
   * Prompt personalizado para el parser de recordatorios (fallback IA).
   * Si está vacío, el servicio usa su prompt por defecto.
   */
  async getRemindersPrompt(): Promise<string> {
    const v = await this.get(SETTING_KEYS.REMINDERS_PROMPT);
    return (v || '').trim();
  }

  async setRemindersPrompt(prompt: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.REMINDERS_PROMPT, prompt || '', auditedBy);
  }

  /**
   * Si está activo, cuando el parser regex de recordatorios no entienda
   * un mensaje, se pasa el texto a la IA (Ollama u OpenAI) para extraer
   * fecha+texto en lenguaje natural. Default: true.
   */
  async getRemindersAiFallback(): Promise<boolean> {
    const v = await this.get(SETTING_KEYS.REMINDERS_AI_FALLBACK);
    if (v === null) {
      const env = (process.env.REMINDERS_AI_FALLBACK || '').toLowerCase();
      if (env === 'false' || env === '0') return false;
      return true;
    }
    return v !== 'false';
  }

  async setRemindersAiFallback(enabled: boolean, auditedBy?: string) {
    return this.set(
      SETTING_KEYS.REMINDERS_AI_FALLBACK,
      enabled ? 'true' : 'false',
      auditedBy,
    );
  }

  // ─── Auto-IA — prompt + persona ───────────────────────────
  /**
   * Prompt de sistema para Auto-IA (cómo debe responder a los contactos
   * autorizados de la lista). Si está vacío, se usa DEFAULT_AUTO_REPLY_PROMPT.
   */
  async getAutoReplyPrompt(): Promise<string> {
    const v = await this.get(SETTING_KEYS.AUTO_REPLY_PROMPT);
    return (v || '').trim();
  }

  async setAutoReplyPrompt(prompt: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.AUTO_REPLY_PROMPT, prompt || '', auditedBy);
  }

  /**
   * Info sobre el usuario para que la IA pueda hablar "como él": forma
   * de hablar, abreviaturas que usa, datos importantes, etc. Se inyecta
   * en el system prompt cuando se responde con Auto-IA.
   */
  async getAutoReplyPersona(): Promise<string> {
    const v = await this.get(SETTING_KEYS.AUTO_REPLY_PERSONA);
    return (v || '').trim();
  }

  async setAutoReplyPersona(persona: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.AUTO_REPLY_PERSONA, persona || '', auditedBy);
  }

  // ─── OpenWA dinámico ───────────────────────────────────────
  /**
   * Config completa de OpenWA leyendo Settings con fallback a process.env.
   * El usuario puede sobrescribir cualquier campo desde el dashboard
   * (vista WhatsApp). Si en DB no hay nada, se usan las env del .env.
   */
  async getOpenWaApiUrl(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENWA_API_URL);
    return (saved || process.env.OPENWA_API_URL || '').trim();
  }

  async setOpenWaApiUrl(url: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENWA_API_URL, (url || '').trim(), auditedBy);
  }

  async getOpenWaApiKey(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENWA_API_KEY);
    return (saved || process.env.OPENWA_API_KEY || '').trim();
  }

  async setOpenWaApiKey(key: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENWA_API_KEY, (key || '').trim(), auditedBy);
  }

  async getOpenWaSessionId(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENWA_SESSION_ID);
    return (saved || process.env.OPENWA_SESSION_ID || '').trim();
  }

  async setOpenWaSessionId(id: string, auditedBy?: string) {
    return this.set(SETTING_KEYS.OPENWA_SESSION_ID, (id || '').trim(), auditedBy);
  }

  async getOpenWaSessionName(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENWA_SESSION_NAME);
    return (saved || process.env.OPENWA_SESSION_NAME || '').trim();
  }

  async setOpenWaSessionName(name: string, auditedBy?: string) {
    return this.set(
      SETTING_KEYS.OPENWA_SESSION_NAME,
      (name || '').trim(),
      auditedBy,
    );
  }

  async getOpenWaSessionPhone(): Promise<string> {
    const saved = await this.get(SETTING_KEYS.OPENWA_SESSION_PHONE);
    return (saved || process.env.OPENWA_SESSION_PHONE || '').trim();
  }

  async setOpenWaSessionPhone(phone: string, auditedBy?: string) {
    return this.set(
      SETTING_KEYS.OPENWA_SESSION_PHONE,
      (phone || '').trim(),
      auditedBy,
    );
  }
}
