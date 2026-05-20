import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
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
}
