import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramReminderBridge } from './telegram-reminder.bridge';

@Module({
  providers: [TelegramService, TelegramReminderBridge],
  controllers: [TelegramController],
})
export class TelegramModule {}
