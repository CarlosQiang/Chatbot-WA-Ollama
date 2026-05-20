import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReminderService } from './reminder.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('reminders')
@Controller('reminders')
export class ReminderController {
  constructor(
    private readonly reminder: ReminderService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async list() {
    const list = await this.reminder.list();
    const tz = await this.settings.getReminderTz();
    return { tz, list };
  }

  @Post()
  async create(
    @Body()
    body: {
      input: string;
      target?: 'telegram' | 'whatsapp';
      telegramChatId?: string;
      whatsappChatId?: string;
    },
  ) {
    if (!body?.input) throw new BadRequestException('input requerido');
    return this.reminder.parseAndCreate(body.input, {
      createdBy: 'dashboard',
      telegramChatId: body.telegramChatId || 'dashboard',
      whatsappChatId: body.whatsappChatId,
      defaultTarget: body.target || 'telegram',
    });
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.reminder.deleteById(id);
  }
}
