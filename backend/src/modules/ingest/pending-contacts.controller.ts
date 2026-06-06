import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PendingContactsService } from './pending-contacts.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

/**
 * Endpoints para que el dashboard muestre contactos pendientes (gente
 * que ha escrito al bot pero NO está en Auto-IA / whitelist) y permita
 * añadirlos con un click. Esto elimina la necesidad de que el usuario
 * copie `@lid` opacos de los logs.
 *
 * Todas las rutas son privadas (protegidas por ApiKeyGuard global —
 * tu dashboard ya envía la API key, no hace falta tocar nada).
 */
@ApiTags('chats')
@Controller('chats/pending')
export class PendingContactsController {
  constructor(
    private readonly pending: PendingContactsService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  @Get()
  async list(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return { items: await this.pending.list(lim) };
  }

  /**
   * Añade el chatId a Auto-IA y lo retira de la lista de pendientes.
   * Útil para el botón "Añadir" del dashboard. Si Auto-IA estaba
   * desactivado, NO se enciende solo (decisión explícita del usuario
   * en otra pantalla, para evitar sorpresas).
   */
  @Post(':chatId/add-autoreply')
  async addToAutoReply(@Param('chatId') chatId: string) {
    if (!chatId) throw new BadRequestException('chatId requerido');
    try {
      const result = await this.settings.addAutoReply(
        chatId,
        'dashboard:pending',
      );
      await this.pending.dismiss(chatId);
      await this.logs.write(
        'info',
        'webhook',
        `Pendiente añadido a Auto-IA: ${chatId}`,
      );
      return { ok: true, autoReply: result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'no se pudo añadir');
    }
  }

  /**
   * Descarta un pendiente sin añadirlo (botón "Ignorar"). El contacto
   * podrá volver a aparecer si escribe otra vez.
   */
  @Delete(':chatId')
  async dismiss(@Param('chatId') chatId: string) {
    if (!chatId) throw new BadRequestException('chatId requerido');
    await this.pending.dismiss(chatId);
    return { ok: true };
  }

  @Delete()
  async clear() {
    await this.pending.clear();
    return { ok: true };
  }
}
