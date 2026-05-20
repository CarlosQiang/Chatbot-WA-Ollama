import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpenWaService } from '../openwa/openwa.service';
import { OllamaService } from '../ollama/ollama.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Public } from '../../common/api-key.guard';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly openwa: OpenWaService,
    private readonly ollama: OllamaService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health() {
    const [db, cache, wa, ai] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client.ping().then((p) => p === 'PONG').catch(() => false),
      this.openwa.health(),
      this.ollama.health(),
    ]);

    const ok = db && cache && wa.ok && ai.ok;
    return {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        backend: { ok: true },
        database: { ok: db },
        redis: { ok: cache },
        openwa: wa,
        ollama: ai,
      },
    };
  }

  @Get('openwa')
  openwaHealth() {
    return this.openwa.health();
  }

  @Get('ollama')
  ollamaHealth() {
    return this.ollama.health();
  }
}
