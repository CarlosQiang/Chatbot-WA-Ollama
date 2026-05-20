import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  async status() {
    const me = await this.telegram.getMe();
    return {
      enabled: this.telegram.isEnabled(),
      bot: me.ok ? { username: me.username, name: me.first_name, id: me.id } : null,
      error: !me.ok ? (me as any).error : undefined,
    };
  }
}
