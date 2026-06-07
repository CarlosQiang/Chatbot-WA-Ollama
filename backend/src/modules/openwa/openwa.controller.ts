import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpenWaService } from './openwa.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('openwa')
@Controller('openwa')
export class OpenWaController {
  constructor(
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
  ) {}

  // ─── Sesión activa ─────────────────────────────────────────
  @Get('session')
  session() {
    return this.openwa.getSession();
  }

  @Get('qr')
  qr() {
    return this.openwa.getQr();
  }

  @Get('sessions')
  async sessions() {
    return this.openwa.listSessions();
  }

  @Get('sessions/:id')
  async sessionById(@Param('id') id: string) {
    return this.openwa.getSession(id);
  }

  @Get('sessions/:id/qr')
  async qrById(@Param('id') id: string) {
    return this.openwa.getQr(id);
  }

  // ─── Webhooks ──────────────────────────────────────────────
  @Get('webhooks')
  webhooks() {
    return this.openwa.listWebhooks();
  }

  @Post('webhooks/register')
  registerWebhook(@Body() body: { url?: string; events?: string[] }) {
    const url = body?.url || process.env.WEBHOOK_URL;
    return this.openwa.registerWebhook(
      url,
      body?.events || ['message.received'],
    );
  }

  // ─── Acciones sobre la sesión ──────────────────────────────
  @Post('session/start')
  start() {
    return this.openwa.startSession();
  }

  /**
   * Limpia el cache de mapeos `@lid -> @c.us` en Redis. Útil cuando una
   * versión anterior cacheó mappings erróneos y queremos forzar
   * re-resolución sin esperar al TTL de 7 días.
   */
  @Post('lid-cache/purge')
  async purgeLidCache() {
    const removed = await this.openwa.purgeLidCache();
    return { ok: true, removed };
  }

  @Post('session/stop')
  stop() {
    return this.openwa.stopSession();
  }

  @Post('session/logout')
  async logout() {
    return this.openwa.logoutSession();
  }

  @Post('sessions/:id/start')
  startById(@Param('id') id: string) {
    return this.openwa.startSession(id);
  }

  @Post('sessions/:id/stop')
  stopById(@Param('id') id: string) {
    return this.openwa.stopSession(id);
  }

  @Post('sessions/:id/logout')
  logoutById(@Param('id') id: string) {
    return this.openwa.logoutSession(id);
  }

  /**
   * Cambia la sesión activa del backend (sin tocar API key/URL).
   */
  @Post('sessions/:id/switch')
  async switchTo(@Param('id') id: string) {
    if (!id?.trim()) throw new BadRequestException('Falta el ID');
    return this.openwa.setActiveSession(id);
  }

  /**
   * Crea una nueva sesión en OpenWA. Si `setActive: true`, la marca como
   * activa automáticamente.
   */
  @Post('sessions')
  async createSession(
    @Body() body: { name?: string; phone?: string; setActive?: boolean },
  ) {
    if (!body?.name?.trim()) throw new BadRequestException('Falta el campo name');
    return this.openwa.createSession({
      name: body.name,
      phone: body.phone,
      setActive: body.setActive !== false, // por defecto sí activarla
    });
  }

  // ─── Config (URL + API key + sessionId) ────────────────────
  /**
   * Devuelve la config actual de OpenWA. La API key se devuelve
   * enmascarada por seguridad (los 4 últimos caracteres).
   */
  @Get('config')
  async getConfig() {
    const url = await this.settings.getOpenWaApiUrl();
    const apiKey = await this.settings.getOpenWaApiKey();
    const sessionId = await this.settings.getOpenWaSessionId();
    const sessionName = await this.settings.getOpenWaSessionName();
    const sessionPhone = await this.settings.getOpenWaSessionPhone();
    return {
      apiUrl: url,
      apiKeyMask: apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-6)}` : '',
      hasApiKey: !!apiKey,
      sessionId,
      sessionName,
      sessionPhone,
    };
  }

  @Put('config')
  async putConfig(
    @Body()
    body: {
      apiUrl?: string;
      apiKey?: string;
      sessionId?: string;
      sessionName?: string;
      sessionPhone?: string;
    },
  ) {
    if (body.apiUrl !== undefined) {
      const u = (body.apiUrl || '').trim();
      if (u && !/^https?:\/\//i.test(u)) {
        throw new BadRequestException(
          'OpenWA API URL debe empezar por http:// o https://',
        );
      }
      await this.settings.setOpenWaApiUrl(u, 'dashboard');
    }
    if (body.apiKey !== undefined) {
      await this.settings.setOpenWaApiKey(body.apiKey, 'dashboard');
    }
    if (body.sessionId !== undefined) {
      await this.settings.setOpenWaSessionId(body.sessionId, 'dashboard');
    }
    if (body.sessionName !== undefined) {
      await this.settings.setOpenWaSessionName(body.sessionName, 'dashboard');
    }
    if (body.sessionPhone !== undefined) {
      await this.settings.setOpenWaSessionPhone(body.sessionPhone, 'dashboard');
    }
    // Fuerza recarga del cliente HTTP en la próxima request.
    this.openwa.invalidateClient();
    return this.getConfig();
  }

  // ─── Envío manual (compat) ─────────────────────────────────
  @Post('send')
  send(@Body() body: { chatId: string; text: string }) {
    return this.openwa.sendText(body.chatId, body.text);
  }
}
