import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { OpenWaService } from '../openwa/openwa.service';
import { IngestService } from './ingest.service';
import { LogsService } from '../logs/logs.service';

/**
 * Poller que pregunta cada N segundos a OpenWA por mensajes nuevos.
 * Sirve como fallback cuando OpenWA NO dispara webhooks
 * (común para self-chats).
 *
 * Se desactiva poniendo POLL_ENABLED=false en el .env.
 */
@Injectable()
export class MessagePoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagePoller.name);
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly openwa: OpenWaService,
    private readonly ingest: IngestService,
    private readonly logs: LogsService,
  ) {
    this.intervalMs = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
    this.enabled = (process.env.POLL_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Polling desactivado (POLL_ENABLED=false)');
      return;
    }
    // Marca los mensajes existentes como "ya vistos" para no procesar histórico
    await this.bootstrap();
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.error(e.message)), this.intervalMs);
    this.logger.log(`📡 Polling activo cada ${this.intervalMs}ms`);
    await this.logs.write('info', 'system', `Polling iniciado (cada ${this.intervalMs}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async bootstrap() {
    try {
      const msgs = await this.openwa.listRecentMessages(50);
      for (const m of msgs) {
        const id = m?.id || m?.messageId || m?.key?.id;
        if (id) await this.openwa.markMessageSeen(id);
      }
      this.logger.log(`Bootstrap: marcados ${msgs.length} mensajes históricos como vistos`);
    } catch (err: any) {
      this.logger.warn(`Bootstrap polling falló: ${err.message}`);
    }
  }

  /**
   * Extrae el body de un payload de OpenWA usando los mismos accesos que
   * `IngestService.extract`. Lo necesitamos para filtrar mensajes firmados
   * por el bot ANTES de pasarlos al ingest (evita spam en logs).
   */
  private extractText(m: any): string {
    const p = m?.data || m?.message || m || {};
    return (
      p.body ||
      p.text ||
      p.content ||
      p.message?.text ||
      p.message?.conversation ||
      p.message?.extendedTextMessage?.text ||
      ''
    );
  }

  private async tick() {
    if (this.running) return; // evita solapamientos
    this.running = true;
    try {
      const msgs = await this.openwa.listRecentMessages(20);
      let skippedBotSigned = 0;
      for (const m of msgs) {
        // Pre-filtro: los mensajes firmados por el bot son ecos suyos,
        // descartar silenciosamente (no inundar logs cada 5s).
        const txt = this.extractText(m);
        if (OpenWaService.isBotSignedMessage(txt)) {
          skippedBotSigned++;
          continue;
        }
        await this.ingest.ingest(m);
      }
      if (skippedBotSigned > 0) {
        this.logger.verbose(
          `Tick: ${skippedBotSigned} ecos propios pre-filtrados (firma bot)`,
        );
      }
    } finally {
      this.running = false;
    }
  }
}
