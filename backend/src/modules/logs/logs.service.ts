import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogSource = 'openwa' | 'ollama' | 'chat' | 'webhook' | 'system' | 'command';

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async write(level: LogLevel, source: LogSource, message: string, meta?: any) {
    try {
      const entry = await this.prisma.log.create({
        data: { level, source, message, meta: meta ?? undefined },
      });
      this.realtime.emit('log:new', entry);
      const log = `[${source}] ${message}`;
      if (level === 'error') this.logger.error(log);
      else if (level === 'warn') this.logger.warn(log);
      else if (level === 'debug') this.logger.debug(log);
      else this.logger.log(log);
      return entry;
    } catch (err) {
      this.logger.error(`Failed to persist log: ${(err as Error).message}`);
    }
  }

  async list(params: { limit?: number; level?: string; source?: string } = {}) {
    const { limit = 100, level, source } = params;
    return this.prisma.log.findMany({
      where: {
        ...(level ? { level } : {}),
        ...(source ? { source } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async clear() {
    return this.prisma.log.deleteMany();
  }
}
