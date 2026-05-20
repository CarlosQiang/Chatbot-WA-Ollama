import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpenWaService } from './openwa.service';

@ApiTags('openwa')
@Controller('openwa')
export class OpenWaController {
  constructor(private readonly openwa: OpenWaService) {}

  @Get('session')
  session() {
    return this.openwa.getSession();
  }

  @Get('qr')
  qr() {
    return this.openwa.getQr();
  }

  @Get('webhooks')
  webhooks() {
    return this.openwa.listWebhooks();
  }

  @Post('webhooks/register')
  registerWebhook(@Body() body: { url?: string; events?: string[] }) {
    const url = body?.url || process.env.WEBHOOK_URL;
    return this.openwa.registerWebhook(url, body?.events || ['message']);
  }

  @Post('session/start')
  start() {
    return this.openwa.startSession();
  }

  @Post('session/stop')
  stop() {
    return this.openwa.stopSession();
  }

  @Post('send')
  send(@Body() body: { chatId: string; text: string }) {
    return this.openwa.sendText(body.chatId, body.text);
  }
}
