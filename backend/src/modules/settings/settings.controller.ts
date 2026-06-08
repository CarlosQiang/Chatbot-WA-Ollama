import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AI_PROVIDERS,
  AiProvider,
  BOT_MODES,
  BOT_MODE_DESCRIPTIONS,
  BotMode,
  SettingsService,
} from './settings.service';
import { OllamaService } from '../ollama/ollama.service';
import { AiService } from '../ai/ai.service';
import { NotesService } from '../notes/notes.service';
import { ReminderService } from '../reminder/reminder.service';
import { ChatService } from '../chat/chat.service';
import {
  hostFromUrl,
  isLoopbackHost,
  isValidOllamaUrl,
  normalizeChatId,
  normalizeChatIdList,
} from '../../common/validators';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ollama: OllamaService,
    private readonly ai: AiService,
  ) {}

  @Get()
  async all() {
    const list = await this.settings.all();
    const map: Record<string, string> = {};
    list.forEach((s) => (map[s.key] = s.value));
    return {
      ...map,
      active_model: await this.settings.getActiveModel(),
      system_prompt: await this.settings.getSystemPrompt(),
      ollamaBaseUrl: await this.settings.getOllamaBaseUrl(),
      ollamaFallbackUrls: await this.settings.getOllamaFallbackUrls(),
      testWhatsappChatId: await this.settings.getTestChatId(),
      allowedChatIds: await this.settings.getAllowedChatIds(),
      adminChatIds: await this.settings.getAdminChatIds(),
      botMode: await this.settings.getBotMode(),
      reminderTz: await this.settings.getReminderTz(),
      botPhone: process.env.OPENWA_SESSION_PHONE || '',
    };
  }

  @Get('mode')
  async getMode() {
    return {
      mode: await this.settings.getBotMode(),
      available: BOT_MODES,
      descriptions: BOT_MODE_DESCRIPTIONS,
    };
  }

  @Put('mode')
  async putMode(@Body() body: { mode?: string }) {
    const mode = (body?.mode || '').toLowerCase() as BotMode;
    if (!BOT_MODES.includes(mode)) {
      throw new BadRequestException(`Modo invalido. Validos: ${BOT_MODES.join(', ')}`);
    }
    await this.settings.setBotMode(mode, 'dashboard');
    return { mode };
  }

  @Get('allowed-chats')
  async getAllowed() {
    return {
      allowedChatIds: await this.settings.getAllowedChatIds(),
      adminChatIds: await this.settings.getAdminChatIds(),
      openToAll: this.settings.isOpenToAll(),
      botPhone: process.env.OPENWA_SESSION_PHONE || '',
      personalWhatsappChatId: await this.settings.getPersonalWhatsappChatId(),
    };
  }

  @Put('allowed-chats')
  async putAllowed(@Body() body: { chatIds?: string[] | string }) {
    // Validación informativa: rechazamos solo si al normalizar no queda nada
    // utilizable de una entrada explícita (evita silencios sorpresivos).
    if (body?.chatIds !== undefined && body.chatIds !== null) {
      const raw = Array.isArray(body.chatIds)
        ? body.chatIds
        : String(body.chatIds).split(/[,;\n]/);
      const invalid: string[] = [];
      for (const id of raw) {
        const trimmed = String(id || '').trim();
        if (trimmed && !normalizeChatId(trimmed)) invalid.push(trimmed);
      }
      if (invalid.length) {
        throw new BadRequestException(
          `chatId invalido(s): ${invalid.join(', ')}. Acepta 612345678, +34612345678 o 34612345678@c.us`,
        );
      }
    }
    await this.settings.setAllowedChatIds(body?.chatIds || [], 'dashboard');
    return { allowedChatIds: await this.settings.getAllowedChatIds() };
  }

  @Get('admins')
  async getAdmins() {
    return { adminChatIds: await this.settings.getAdminChatIds() };
  }

  @Put('admins')
  async putAdmins(@Body() body: { chatIds?: string[] | string }) {
    if (body?.chatIds !== undefined && body.chatIds !== null) {
      const raw = Array.isArray(body.chatIds)
        ? body.chatIds
        : String(body.chatIds).split(/[,;\n]/);
      const invalid: string[] = [];
      for (const id of raw) {
        const trimmed = String(id || '').trim();
        if (trimmed && !normalizeChatId(trimmed)) invalid.push(trimmed);
      }
      if (invalid.length) {
        throw new BadRequestException(
          `chatId invalido(s): ${invalid.join(', ')}. Acepta 612345678, +34612345678 o 34612345678@c.us`,
        );
      }
    }
    await this.settings.setAdminChatIds(body?.chatIds || [], 'dashboard');
    return { adminChatIds: await this.settings.getAdminChatIds() };
  }

  @Get('personal-whatsapp')
  async getPersonalWa() {
    return {
      chatId: await this.settings.getPersonalWhatsappChatId(),
      botPhone: process.env.OPENWA_SESSION_PHONE || '',
    };
  }

  @Put('personal-whatsapp')
  async putPersonalWa(@Body() body: { chatId?: string }) {
    const raw = (body?.chatId || '').trim();
    if (raw && !normalizeChatId(raw)) {
      throw new BadRequestException(
        'chatId invalido. Acepta 612345678, +34612345678 o 34612345678@c.us',
      );
    }
    await this.settings.setPersonalWhatsappChatId(raw, 'dashboard');
    return {
      chatId: await this.settings.getPersonalWhatsappChatId(),
    };
  }

  @Put()
  async update(@Body() body: Record<string, string>) {
    const blocked = ['BACKEND_API_KEY', 'WEBHOOK_SECRET', 'JWT_SECRET', 'TELEGRAM_BOT_TOKEN'];
    const results: any[] = [];
    for (const [k, v] of Object.entries(body)) {
      if (blocked.includes(k)) continue;
      if (typeof v === 'string') {
        results.push(await this.settings.set(k, v, 'dashboard'));
      }
    }
    return { updated: results.length };
  }

  @Get('ollama')
  async getOllama() {
    const baseUrl = await this.settings.getOllamaBaseUrl();
    const fallback = await this.settings.getOllamaFallbackUrls();
    const activeModel = await this.settings.getActiveModel();
    const test = await this.ollama.testConnection(baseUrl);
    return {
      baseUrl,
      fallbackUrls: fallback,
      activeModel,
      status: test.status,
      latencyMs: test.latencyMs,
      models: test.models,
      ...(test.error ? { error: test.error } : {}),
    };
  }

  @Put('ollama')
  async putOllama(
    @Body() body: { baseUrl?: string; activeModel?: string; fallbackUrls?: string[] },
  ) {
    if (body.baseUrl !== undefined) {
      if (!isValidOllamaUrl(body.baseUrl)) {
        throw new BadRequestException(
          'URL Ollama invalida. Debe empezar por http:// o https://.',
        );
      }
      const host = hostFromUrl(body.baseUrl);
      if (host && isLoopbackHost(host)) {
        throw new BadRequestException(
          `Host "${host}" apunta al propio contenedor. Usa host.docker.internal o IP de LAN.`,
        );
      }
      await this.settings.setOllamaBaseUrl(body.baseUrl, 'dashboard');
    }
    if (body.activeModel !== undefined && body.activeModel.trim()) {
      await this.settings.setActiveModel(body.activeModel.trim(), 'dashboard');
    }
    if (body.fallbackUrls !== undefined) {
      for (const u of body.fallbackUrls) {
        if (!isValidOllamaUrl(u)) {
          throw new BadRequestException(`URL fallback invalida: "${u}"`);
        }
      }
      await this.settings.setOllamaFallbackUrls(body.fallbackUrls, 'dashboard');
    }
    return this.getOllama();
  }

  @Get('auto-reply')
  getAutoReply() {
    return this.settings.getAutoReply();
  }

  /**
   * Setear / borrar el alias humano para un chatId concreto. Pensado
   * para que el dashboard muestre "Yago", "Marta", etc. en lugar de
   * `6764640657447@lid`. Body: `{ chatId, nickname }`. `nickname=null|""`
   * borra el alias.
   */
  @Put('auto-reply/nickname')
  async putAutoReplyNickname(
    @Body() body: { chatId?: string; nickname?: string | null } = {},
  ) {
    const chatId = (body?.chatId || '').trim();
    if (!chatId) {
      throw new BadRequestException('chatId requerido');
    }
    try {
      const nicknames = await this.settings.setAutoReplyNickname(
        chatId,
        body.nickname ?? null,
        'dashboard',
      );
      return { ok: true, nicknames };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'no se pudo guardar');
    }
  }

  @Put('auto-reply')
  async putAutoReply(
    @Body()
    body: {
      enabled?: boolean;
      /** Lista (preferido). Acepta array o CSV. */
      chatIds?: string[] | string;
      /** Legacy single chatId. Si llega solo, se trata como lista de 1. */
      chatId?: string;
    },
  ) {
    let normalized: string[] | undefined;

    if (body?.chatIds !== undefined && body.chatIds !== null) {
      const raw = Array.isArray(body.chatIds)
        ? body.chatIds
        : String(body.chatIds).split(/[,;\n]/);
      const invalid: string[] = [];
      const valid: string[] = [];
      for (const id of raw) {
        const trimmed = String(id || '').trim();
        if (!trimmed) continue;
        const n = normalizeChatId(trimmed);
        if (n) valid.push(n);
        else invalid.push(trimmed);
      }
      if (invalid.length) {
        throw new BadRequestException(
          `chatId invalido(s): ${invalid.join(', ')}. Acepta 612345678, +34612345678 o 34612345678@c.us`,
        );
      }
      normalized = valid;
    } else if (body?.chatId !== undefined) {
      // Compat: vino el campo viejo single.
      const trimmed = (body.chatId || '').trim();
      if (trimmed === '') {
        normalized = [];
      } else {
        const n = normalizeChatId(trimmed);
        if (!n) {
          throw new BadRequestException(
            'chatId invalido. Acepta 612345678, +34612345678 o 34612345678@c.us',
          );
        }
        normalized = [n];
      }
    }

    return this.settings.setAutoReply(!!body?.enabled, normalized, 'dashboard');
  }

  /**
   * Diagnóstico: dado un número de teléfono (en cualquier formato), explica
   * EXACTAMENTE qué le pasará si escribe al bot. Útil cuando "Auto-IA no
   * responde a quien yo quiero" — el endpoint dice si el número fue
   * normalizado bien, si está en la lista, si el modo lo bloquea, etc.
   */
  @Get('auto-reply/diagnose')
  async diagnoseAutoReply(@Query('chatId') raw?: string) {
    const input = (raw || '').trim();
    if (!input) {
      throw new BadRequestException('Falta query param `chatId`.');
    }
    const normalized = normalizeChatId(input);
    const mode = await this.settings.getBotMode();
    const auto = await this.settings.getAutoReply();
    const allowed = await this.settings.getAllowedChatIds();
    const admins = await this.settings.getAdminChatIds();
    const botPhone = (process.env.OPENWA_SESSION_PHONE || '').replace(/\D/g, '');
    const botChatId = botPhone ? `${botPhone}@c.us` : '';

    const isAdmin = !!normalized && admins.includes(normalized);
    const isAutoTarget = !!(
      normalized &&
      auto.enabled &&
      auto.chatIds.includes(normalized)
    );
    const isInWhitelist = !!normalized && allowed.includes(normalized);

    let willReply = false;
    let willUseAutoIaPrompt = false;
    let reason = '';

    if (!normalized) {
      reason = `No se pudo normalizar "${input}". Debe ser un número de teléfono (6–18 dígitos).`;
    } else if (normalized === botChatId) {
      reason =
        'Es el propio número del bot. El bot ignora sus propios mensajes para evitar bucles.';
    } else if (mode === 'silent') {
      reason = 'Modo bot = SILENT. El bot no responde a nadie, ni siquiera Auto-IA.';
    } else if (mode === 'maintenance' && !isAdmin) {
      reason =
        'Modo bot = MAINTENANCE. Solo administradores reciben aviso; el resto se ignora.';
    } else if (mode === 'manual' && !isAutoTarget && !isAdmin) {
      reason =
        'Modo bot = MANUAL. Solo admins (con comandos) o números Auto-IA reciben respuesta.';
    } else if (!isAdmin && !isAutoTarget && !isInWhitelist) {
      reason =
        'No está en Auto-IA, no está en la whitelist y no es admin. Añádelo en Ajustes → Auto-IA para que reciba respuestas IA.';
    } else {
      willReply = true;
      willUseAutoIaPrompt = isAutoTarget;
      reason = isAutoTarget
        ? 'Auto-IA activa: el bot responderá SIEMPRE con Ollama usando tu prompt + persona.'
        : isAdmin
          ? 'Es admin: el bot responderá a sus comandos. Mensajes normales también van por Ollama si el modo no es manual.'
          : 'Está en la whitelist: el bot responderá según el modo activo.';
    }

    return {
      input,
      normalized,
      botChatId,
      mode,
      isAdmin,
      isAutoTarget,
      isInWhitelist,
      autoReplyEnabled: auto.enabled,
      autoReplyListSize: auto.chatIds.length,
      willReply,
      willUseAutoIaPrompt,
      reason,
    };
  }

  // ─── Proveedor IA (Ollama | OpenAI) ───────────────────────
  @Get('ai')
  async getAi() {
    const info = await this.ai.info();
    return {
      ...info,
      availableProviders: AI_PROVIDERS,
    };
  }

  @Put('ai')
  async putAi(
    @Body()
    body: {
      provider?: string;
      temperature?: number | string;
      openaiApiKey?: string;
      openaiBaseUrl?: string;
      openaiModel?: string;
    },
  ) {
    if (body.provider !== undefined) {
      const p = (body.provider || '').toLowerCase() as AiProvider;
      if (!AI_PROVIDERS.includes(p)) {
        throw new BadRequestException(
          `Proveedor invalido. Validos: ${AI_PROVIDERS.join(', ')}`,
        );
      }
      await this.settings.setAiProvider(p, 'dashboard');
    }
    if (body.temperature !== undefined) {
      const t = typeof body.temperature === 'string'
        ? parseFloat(body.temperature)
        : body.temperature;
      if (isNaN(t) || t < 0 || t > 2) {
        throw new BadRequestException('Temperatura debe ser un número entre 0 y 2.');
      }
      await this.settings.setAiTemperature(t, 'dashboard');
    }
    if (body.openaiApiKey !== undefined) {
      await this.settings.setOpenAiApiKey(body.openaiApiKey, 'dashboard');
    }
    if (body.openaiBaseUrl !== undefined) {
      const u = (body.openaiBaseUrl || '').trim();
      if (u && !/^https?:\/\//i.test(u)) {
        throw new BadRequestException('OpenAI Base URL debe empezar por http:// o https://');
      }
      await this.settings.setOpenAiBaseUrl(u, 'dashboard');
    }
    if (body.openaiModel !== undefined) {
      await this.settings.setOpenAiModel(body.openaiModel, 'dashboard');
    }
    return this.getAi();
  }

  @Post('ai/test-openai')
  async testOpenAi(@Body() body: { baseUrl?: string; apiKey?: string }) {
    return this.ai.testOpenAi({
      baseUrl: body?.baseUrl,
      apiKey: body?.apiKey,
    });
  }

  // ─── Prompts personalizables (notas y recordatorios) ─────
  @Get('prompts')
  async getPrompts() {
    const notes = await this.settings.getNotesPrompt();
    const reminders = await this.settings.getRemindersPrompt();
    const aiFallback = await this.settings.getRemindersAiFallback();
    return {
      notes,
      reminders,
      remindersAiFallback: aiFallback,
      defaults: {
        notes: NotesService.DEFAULT_NOTES_PROMPT,
        reminders: ReminderService.DEFAULT_REMINDERS_PROMPT,
      },
    };
  }

  @Put('prompts')
  async putPrompts(
    @Body()
    body: {
      notes?: string;
      reminders?: string;
      remindersAiFallback?: boolean;
    },
  ) {
    if (body.notes !== undefined) {
      await this.settings.setNotesPrompt(body.notes, 'dashboard');
    }
    if (body.reminders !== undefined) {
      await this.settings.setRemindersPrompt(body.reminders, 'dashboard');
    }
    if (body.remindersAiFallback !== undefined) {
      await this.settings.setRemindersAiFallback(
        !!body.remindersAiFallback,
        'dashboard',
      );
    }
    return this.getPrompts();
  }

  // ─── Auto-IA: prompt + persona ────────────────────────────
  @Get('auto-reply/prompt')
  async getAutoReplyPrompt() {
    return {
      prompt: await this.settings.getAutoReplyPrompt(),
      persona: await this.settings.getAutoReplyPersona(),
      default: ChatService.DEFAULT_AUTO_REPLY_PROMPT,
    };
  }

  @Put('auto-reply/prompt')
  async putAutoReplyPrompt(
    @Body() body: { prompt?: string; persona?: string },
  ) {
    if (body.prompt !== undefined) {
      await this.settings.setAutoReplyPrompt(body.prompt, 'dashboard');
    }
    if (body.persona !== undefined) {
      await this.settings.setAutoReplyPersona(body.persona, 'dashboard');
    }
    return this.getAutoReplyPrompt();
  }

  @Post('ollama/test')
  async testOllama(@Body() body: { baseUrl?: string }) {
    const baseUrl = body?.baseUrl?.trim();
    if (!baseUrl || !isValidOllamaUrl(baseUrl)) {
      return { ok: false, status: 'offline', error: 'URL invalida.' };
    }
    const test = await this.ollama.testConnection(baseUrl);
    if (test.ok) {
      return {
        ok: true,
        status: 'online',
        latencyMs: test.latencyMs,
        models: test.models,
      };
    }
    return {
      ok: false,
      status: 'offline',
      error: test.error || 'No se pudo conectar con ese servidor Ollama',
    };
  }
}
