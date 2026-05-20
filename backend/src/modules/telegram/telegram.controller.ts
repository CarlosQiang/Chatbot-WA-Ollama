import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly settings: SettingsService,
  ) {}

  @Get('status')
  async status() {
    const me = await this.telegram.getMe();
    const cfg = await this.telegram.getConfig();
    return {
      enabled: this.telegram.isEnabled(),
      bot: me.ok ? { username: me.username, name: me.first_name, id: me.id } : null,
      error: !me.ok ? (me as any).error : undefined,
      config: cfg,
    };
  }

  @Get('config')
  async getConfig() {
    return this.telegram.getConfig();
  }

  @Put('config')
  async setConfig(
    @Body()
    body: {
      botToken?: string;
      allowedUserIds?: string;
      bridgeWa?: boolean;
      bridgeChatId?: string;
    },
  ) {
    if (body.bridgeChatId && !/^\d{6,18}@c\.us$/.test(body.bridgeChatId)) {
      throw new BadRequestException(
        'bridgeChatId invalido. Formato: 34670209033@c.us',
      );
    }
    await this.telegram.setConfig(body);
    return this.telegram.getConfig();
  }

  @Post('restart')
  async restart() {
    await this.telegram.restartFromSettings();
    return { ok: true };
  }
}
