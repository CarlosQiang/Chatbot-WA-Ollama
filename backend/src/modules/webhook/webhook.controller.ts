import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IngestService } from '../ingest/ingest.service';
import { LogsService } from '../logs/logs.service';
import { Public } from '../../common/api-key.guard';
import { isPlaceholderWebhookSecret } from '../../common/validators';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@ApiTags('webhooks')
@Controller('webhooks')
// Webhook público — OpenWA puede burstear muchos eventos seguidos cuando
// reintenta tras un fallo de red o cuando llegan ráfagas. Sobreescribimos
// el bucket `default` localmente con un límite más alto (600/min) en lugar
// de añadir un bucket nuevo: en throttler v5 los buckets son AND, así que
// añadir uno nuevo no relaja al default — hay que ampliar el propio.
@Throttle({ default: { ttl: 60_000, limit: 600 } })
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);
  private warnedOpenWebhook = false;

  constructor(
    private readonly ingest: IngestService,
    private readonly logs: LogsService,
  ) {}

  @Public()
  @Post('openwa')
  @HttpCode(200)
  async handleOpenwa(
    @Body() body: any,
    @Headers('x-webhook-secret') headerSecret: string | undefined,
    @Query('token') querySecret: string | undefined,
    @Req() req: any,
  ) {
    return this.guardAndIngest(body, headerSecret || querySecret, req);
  }

  @Public()
  @Post('openwa/:secret')
  @HttpCode(200)
  async handleOpenwaWithSecret(@Body() body: any, @Req() req: any) {
    const pathSecret = (req.params?.secret || '').trim();
    return this.guardAndIngest(body, pathSecret, req);
  }

  private async guardAndIngest(body: any, provided: string | undefined, req: any) {
    // Aceptar pings vacios sin error feo
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      return { ok: true, ignored: 'empty' };
    }

    const required = process.env.WEBHOOK_SECRET;
    const ip: string =
      req.ip ||
      req.headers?.['x-forwarded-for'] ||
      req.headers?.['x-real-ip'] ||
      req.connection?.remoteAddress ||
      '';
    const isLoopback = LOOPBACK.has(ip) || ip.startsWith('127.') || ip === '::1';

    if (isPlaceholderWebhookSecret(required)) {
      if (!this.warnedOpenWebhook) {
        this.warnedOpenWebhook = true;
        this.logger.warn('WEBHOOK_SECRET no configurado. Webhook solo accesible desde loopback.');
      }
      if (!isLoopback) {
        await this.logs.write('warn', 'webhook', `Webhook rechazado: sin secret, origen ${ip}`);
        throw new ForbiddenException('Webhook secret no configurado');
      }
      return this.ingest.ingest(body);
    }

    if (!provided || provided !== required) {
      await this.logs.write('warn', 'webhook', `Webhook rechazado: secret invalido (origen ${ip})`);
      throw new ForbiddenException('Webhook secret invalido');
    }

    return this.ingest.ingest(body);
  }
}
