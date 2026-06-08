import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DiagnosticsService } from './diagnostics.service';
import { SettingsService } from '../settings/settings.service';
import { isValidChatId } from '../../common/validators';

const CHATID_HELP = 'Usa formato WhatsApp válido: 34670209033@c.us';

@ApiTags('diagnostics')
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(
    private readonly diag: DiagnosticsService,
    private readonly settings: SettingsService,
  ) {}

  @Post('whatsapp/test-message')
  async testWhatsapp(@Body() body: { chatId?: string } = {}) {
    const chatId = (body?.chatId || (await this.settings.getTestChatId())).trim();
    if (!isValidChatId(chatId)) {
      throw new BadRequestException(CHATID_HELP);
    }
    return this.diag.testWhatsapp(chatId);
  }

  @Post('ollama-whatsapp/test-message')
  async testOllamaWhatsapp(
    @Body() body: { chatId?: string; prompt?: string } = {},
  ) {
    const chatId = (body?.chatId || (await this.settings.getTestChatId())).trim();
    if (!isValidChatId(chatId)) {
      throw new BadRequestException(CHATID_HELP);
    }
    return this.diag.testOllamaWhatsapp(chatId, body?.prompt);
  }

  /**
   * Estado consolidado de Auto-IA en una sola llamada. Pensado para que
   * el usuario sepa de un vistazo si está listo para responder o qué
   * falta. Incluye `readyToReply` con razón en `reasonNotReady`.
   */
  @Get('autoreply')
  async autoreplyStatus() {
    const auto = await this.settings.getAutoReply();
    const persona = await this.settings.getAutoReplyPersona().catch(() => '');
    const prompt = await this.settings.getAutoReplyPrompt().catch(() => '');
    const mode = await this.settings.getBotMode().catch(() => 'unknown');

    const reasons: string[] = [];
    if (!auto.enabled) reasons.push('toggle Auto-IA desactivado');
    if (auto.chatIds.length === 0) reasons.push('lista de números vacía');
    if (mode === 'maintenance') reasons.push('bot en modo maintenance');
    // silent NO bloquea Auto-IA (override aplicado), pero lo mencionamos
    // por transparencia.

    const readyToReply = reasons.length === 0;

    return {
      readyToReply,
      reasonNotReady: reasons.length ? reasons.join(' + ') : null,
      autoReply: {
        enabled: auto.enabled,
        chatIds: auto.chatIds,
        chatIdsCount: auto.chatIds.length,
      },
      persona: {
        configured: !!persona,
        preview: persona ? persona.slice(0, 120) : null,
      },
      customPrompt: {
        configured: !!prompt,
        preview: prompt ? prompt.slice(0, 120) : null,
      },
      botMode: mode,
      hint: readyToReply
        ? 'Auto-IA listo. Cuando uno de la lista escriba, la IA responderá como tú.'
        : `Falta: ${reasons.join(', ')}. Añade un contacto con POST /chats/pending/<chatId>/add-autoreply y se activará todo automáticamente.`,
    };
  }
}
