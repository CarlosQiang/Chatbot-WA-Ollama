import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  BOT_MODES,
  BOT_MODE_DESCRIPTIONS,
  BotMode,
  SettingsService,
} from './settings.service';
import { OllamaService } from '../ollama/ollama.service';
import {
  hostFromUrl,
  isLoopbackHost,
  isValidOllamaUrl,
} from '../../common/validators';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly ollama: OllamaService,
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
    };
  }

  @Put('allowed-chats')
  async putAllowed(@Body() body: { chatIds?: string[] }) {
    const list = body?.chatIds || [];
    for (const id of list) {
      if (!/^\d{6,18}@c\.us$/.test(id)) {
        throw new BadRequestException(`chatId invalido: "${id}". Usa formato 34670209033@c.us`);
      }
    }
    await this.settings.setAllowedChatIds(list, 'dashboard');
    return { allowedChatIds: await this.settings.getAllowedChatIds() };
  }

  @Get('admins')
  async getAdmins() {
    return { adminChatIds: await this.settings.getAdminChatIds() };
  }

  @Put('admins')
  async putAdmins(@Body() body: { chatIds?: string[] }) {
    const list = body?.chatIds || [];
    for (const id of list) {
      if (!/^\d{6,18}@c\.us$/.test(id)) {
        throw new BadRequestException(`chatId invalido: "${id}". Usa formato 34670209033@c.us`);
      }
    }
    await this.settings.setAdminChatIds(list, 'dashboard');
    return { adminChatIds: await this.settings.getAdminChatIds() };
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

  @Put('auto-reply')
  async putAutoReply(@Body() body: { enabled?: boolean; chatId?: string }) {
    if (body?.chatId && !/^\d{6,18}@c\.us$/.test(body.chatId)) {
      throw new BadRequestException('chatId invalido. Formato: 34670209033@c.us');
    }
    return this.settings.setAutoReply(!!body?.enabled, body?.chatId, 'dashboard');
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
