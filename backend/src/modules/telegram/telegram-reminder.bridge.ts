import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ReminderService } from '../reminder/reminder.service';
import { TelegramService } from './telegram.service';

/**
 * Conecta el ReminderService con el TelegramService al arrancar,
 * para que los recordatorios marcados como target=telegram puedan enviarse.
 * Se hace así para evitar dependencia circular en los constructores.
 */
@Injectable()
export class TelegramReminderBridge implements OnApplicationBootstrap {
  constructor(
    private readonly reminder: ReminderService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    this.reminder.setTelegramSender((chatId, text) => this.telegram.sendMessage(chatId, text));
  }
}
