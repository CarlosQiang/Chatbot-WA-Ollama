import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export const SETTING_KEYS = {
  ACTIVE_MODEL: 'active_model',
  SYSTEM_PROMPT: 'system_prompt',
  OLLAMA_BASE_URL: 'ollamaBaseUrl',
  OLLAMA_FALLBACK_URLS: 'ollamaFallbackUrls',
  TEST_WHATSAPP_CHAT_ID: 'testWhatsappChatId',
  ALLOWED_CHAT_IDS: 'allowedChatIds',
  ADMIN_CHAT_IDS: 'adminChatIds',
  AUTO_REPLY_ENABLED: 'autoReplyEnabled',
  AUTO_REPLY_CHAT_ID: 'autoReplyChatId',
  BOT_MODE: 'bot_mode',
  REMINDER_TZ: 'reminderTz',
  TG_BOT_TOKEN: 'tgBotToken',
  TG_ALLOWED_USER_IDS: 'tgAllowedUserIds',
  TG_BRIDGE_WA: 'tgBridgeWa',
  TG_BRIDGE_CHAT_ID: 'tgBridgeChatId',
} as const;

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
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async setAllowedChatIds(ids: string[], auditedBy?: string) {
    const cleaned = (ids || [])
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .filter((s, i, a) => a.indexOf(s) === i);
    return this.set(SETTING_KEYS.ALLOWED_CHAT_IDS, cleaned.join(','), auditedBy);
  }

  isOpenToAll(): boolean {
    return (process.env.OPEN_TO_ALL || '').toLowerCase() === 'true';
  }

  async isAllowed(chatId: string): Promise<boolean> {
    const list = await this.getAllowedChatIds();
    if (list.length === 0) return this.isOpenToAll();
    return list.includes(chatId);
  }

  async addAllowed(chatId: string, auditedBy?: string) {
    const list = await this.getAllowedChatIds();
    if (!list.includes(chatId)) list.push(chatId);
    return this.setAllowedChatIds(list, auditedBy);
  }

  async removeAllowed(chatId: string, auditedBy?: string) {
    const list = await this.getAllowedChatIds();
    return this.setAllowedChatIds(list.filter((c) => c !== chatId), auditedBy);
  }

  async getAdminChatIds(): Promise<string[]> {
    const saved = await this.get(SETTING_KEYS.ADMIN_CHAT_IDS);
    const raw = saved ?? process.env.ADMIN_CHAT_IDS ?? '';
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);

    const botPhone = (process.env.OPENWA_SESSION_PHONE || '').replace(/\D/g, '');
    if (botPhone) {
      const ownerChatId = `${botPhone}@c.us`;
      if (!list.includes(ownerChatId)) list.push(ownerChatId);
    }
    return list;
  }

  async setAdminChatIds(ids: string[], auditedBy?: string) {
    const cleaned = (ids || [])
      .map((s) => (s || '').trim())
      .filter(Boolean)
      .filter((s, i, a) => a.indexOf(s) === i);
    return this.set(SETTING_KEYS.ADMIN_CHAT_IDS, cleaned.join(','), auditedBy);
  }

  async isAdmin(chatId: string): Promise<boolean> {
    const list = await this.getAdminChatIds();
    return list.includes(chatId);
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

  async getAutoReply(): Promise<{ enabled: boolean; chatId: string }> {
    const en = await this.get(SETTING_KEYS.AUTO_REPLY_ENABLED);
    const cid = await this.get(SETTING_KEYS.AUTO_REPLY_CHAT_ID);
    return { enabled: en === 'true', chatId: cid || '' };
  }

  async setAutoReply(enabled: boolean, chatId?: string, auditedBy?: string) {
    await this.set(SETTING_KEYS.AUTO_REPLY_ENABLED, enabled ? 'true' : 'false', auditedBy);
    if (chatId !== undefined) {
      await this.set(SETTING_KEYS.AUTO_REPLY_CHAT_ID, chatId, auditedBy);
    }
    return this.getAutoReply();
  }

  async isAutoReply(chatId: string): Promise<boolean> {
    const { enabled, chatId: target } = await this.getAutoReply();
    return enabled && target === chatId;
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

}
