import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OpenWaService } from '../openwa/openwa.service';
import { OllamaService } from '../ollama/ollama.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { Public } from '../../common/api-key.guard';

/**
 * `/health` está pensado para tres consumidores:
 *  - Docker healthcheck (`wget --spider`): solo necesita HTTP 200.
 *  - Dashboard: necesita estado por servicio + latencias para pintar
 *    los badges (verde / ámbar / rojo) y mostrar tiempos.
 *  - Operador desde curl/Swagger: necesita información suficiente para
 *    diagnosticar sin abrir logs del contenedor.
 *
 * Por eso el endpoint compone (a) un `status` global (ok | degraded),
 * (b) un mapa `services` con `ok` / `latencyMs` / metadatos por servicio,
 * y (c) `summary.totalLatencyMs` para tener una sola métrica que mirar
 * cuando algo va lento sin saber qué.
 */

const APP_VERSION = process.env.APP_VERSION || '0.1.0';
const APP_NAME = process.env.APP_NAME || 'local-ai-hub-backend';
const startedAt = Date.now();

async function timed<T>(p: Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await p;
  return { value, ms: Date.now() - t0 };
}

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
    const t0 = Date.now();
    const [db, cache, wa, ai] = await Promise.all([
      timed(
        this.prisma
          .$queryRaw`SELECT 1`.then(() => true)
          .catch(() => false),
      ).catch((err) => ({ value: false, ms: 0, error: err?.message })),
      timed(
        this.redis.client
          .ping()
          .then((p: string) => p === 'PONG')
          .catch(() => false),
      ).catch((err) => ({ value: false, ms: 0, error: err?.message })),
      this.openwa.health(),
      this.ollama.health(),
    ]);

    const ok = (db as any).value && (cache as any).value && wa.ok && ai.ok;
    const totalLatencyMs = Date.now() - t0;
    const uptimeSec = Math.round((Date.now() - startedAt) / 1000);

    return {
      status: ok ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      app: { name: APP_NAME, version: APP_VERSION, uptimeSec },
      summary: { totalLatencyMs },
      services: {
        backend: { ok: true },
        database: {
          ok: (db as any).value,
          latencyMs: (db as any).ms,
          ...((db as any).error ? { error: (db as any).error } : {}),
        },
        redis: {
          ok: (cache as any).value,
          latencyMs: (cache as any).ms,
          ...((cache as any).error ? { error: (cache as any).error } : {}),
        },
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

  /**
   * Endpoint ligero pensado para readiness probes (Docker, k8s). No hace
   * IO contra OpenWA / Ollama; sólo verifica DB y Redis, que son las
   * dependencias críticas internas. OpenWA/Ollama pueden estar caídos y
   * el backend sigue siendo "ready" para servir tráfico del dashboard.
   */
  @Get('ready')
  async ready() {
    const [db, cache] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.client
        .ping()
        .then((p: string) => p === 'PONG')
        .catch(() => false),
    ]);
    const ok = db && cache;
    return {
      status: ok ? 'ok' : 'not_ready',
      timestamp: new Date().toISOString(),
      database: db,
      redis: cache,
    };
  }
}
