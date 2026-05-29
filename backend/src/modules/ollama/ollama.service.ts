import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { LogsService } from '../logs/logs.service';
import { SettingsService } from '../settings/settings.service';

export type OllamaModel = {
  name: string;
  modified_at?: string;
  size?: number;
  digest?: string;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ClientCache = { http: AxiosInstance };

@Injectable()
export class OllamaService implements OnModuleDestroy {
  private readonly logger = new Logger(OllamaService.name);
  private readonly timeoutMs: number;

  private clients = new Map<string, ClientCache>();
  private httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
  private httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });

  private modelsCache = new Map<string, { models: OllamaModel[]; ts: number }>();
  private readonly MODELS_TTL_MS = 60_000;

  private activeUrl: string | null = null;
  private activeUrlCheckedAt = 0;
  private readonly ACTIVE_URL_TTL_MS = 30_000;

  private latencyWindow: number[] = [];
  private errorsWindow: number[] = [];

  constructor(
    private readonly logs: LogsService,
    private readonly settings: SettingsService,
  ) {
    this.timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || '300000', 10);
  }

  onModuleDestroy() {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }

  private clientFor(baseUrl: string): AxiosInstance {
    const cached = this.clients.get(baseUrl);
    if (cached) return cached.http;
    const httpClient = axios.create({
      baseURL: baseUrl,
      timeout: this.timeoutMs,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: { 'Content-Type': 'application/json' },
    });
    this.clients.set(baseUrl, { http: httpClient });
    return httpClient;
  }

  async getActiveBaseUrl(): Promise<string> {
    const now = Date.now();
    if (this.activeUrl && now - this.activeUrlCheckedAt < this.ACTIVE_URL_TTL_MS) {
      return this.activeUrl;
    }
    const primary = await this.settings.getOllamaBaseUrl();
    const fallback = await this.settings.getOllamaFallbackUrls();
    const candidates = [primary, ...fallback.filter((u) => u !== primary)];

    for (const url of candidates) {
      try {
        await this.clientFor(url).get('/api/tags', { timeout: 5_000 });
        if (url !== primary) {
          this.logger.warn(`Ollama primario caido, usando fallback: ${url}`);
          await this.logs.write('warn', 'ollama', `Primario ${primary} caido -> fallback ${url}`);
        }
        this.activeUrl = url;
        this.activeUrlCheckedAt = now;
        return url;
      } catch {
        continue;
      }
    }

    this.activeUrl = primary;
    this.activeUrlCheckedAt = now;
    return primary;
  }

  invalidateActiveUrl() {
    this.activeUrl = null;
    this.activeUrlCheckedAt = 0;
  }

  async testConnection(baseUrl: string): Promise<{
    ok: boolean;
    status: 'online' | 'offline';
    latencyMs: number | null;
    models: string[];
    error?: string;
  }> {
    const t0 = Date.now();
    try {
      const { data } = await this.clientFor(baseUrl).get('/api/tags', { timeout: 8_000 });
      const models = (data?.models ?? []).map((m: any) => m.name);
      return { ok: true, status: 'online', latencyMs: Date.now() - t0, models };
    } catch (err: any) {
      return {
        ok: false,
        status: 'offline',
        latencyMs: null,
        models: [],
        error: err?.message || 'No se pudo conectar con Ollama',
      };
    }
  }

  async health() {
    const baseUrl = await this.getActiveBaseUrl();
    const activeModel = await this.settings
      .getActiveModel()
      .catch(() => null as any);
    try {
      const t0 = Date.now();
      const { data } = await this.clientFor(baseUrl).get('/api/tags', { timeout: 5_000 });
      return {
        ok: true,
        baseUrl,
        models: data?.models?.length ?? 0,
        activeModel,
        latencyMs: Date.now() - t0,
      };
    } catch (err) {
      return {
        ok: false,
        baseUrl,
        activeModel,
        error: (err as Error).message,
      };
    }
  }

  async listModels(force = false): Promise<OllamaModel[]> {
    const baseUrl = await this.getActiveBaseUrl();
    const cached = this.modelsCache.get(baseUrl);
    if (!force && cached && Date.now() - cached.ts < this.MODELS_TTL_MS) {
      return cached.models;
    }
    try {
      const { data } = await this.clientFor(baseUrl).get('/api/tags');
      const models: OllamaModel[] = data?.models ?? [];
      this.modelsCache.set(baseUrl, { models, ts: Date.now() });
      return models;
    } catch (err) {
      await this.logs.write('error', 'ollama', `listModels (${baseUrl}): ${(err as Error).message}`);
      return cached?.models ?? [];
    }
  }

  invalidateModelsCache() {
    this.modelsCache.clear();
  }

  async chat(model: string, messages: ChatMessage[]): Promise<string> {
    // Usar SIEMPRE el primario configurado primero, no el cacheado.
    // Esto evita que un cambio reciente de primario quede tapado por el cache.
    const primary = await this.settings.getOllamaBaseUrl();
    const all = await this.settings.getOllamaFallbackUrls();
    const candidates = [primary, ...all.filter((u) => u !== primary)];

    const failures: Array<{ url: string; reason: string }> = [];

    for (const baseUrl of candidates) {
      const t0 = Date.now();
      try {
        const { data } = await this.clientFor(baseUrl).post('/api/chat', {
          model,
          messages,
          stream: false,
        });
        const text: string = data?.message?.content ?? data?.messages?.[0]?.content ?? '';
        this.recordLatency(Date.now() - t0);
        this.activeUrl = baseUrl;
        this.activeUrlCheckedAt = Date.now();
        return text.trim();
      } catch (err: any) {
        const msg = err?.response?.data?.error || err.message;
        const status = err?.response?.status;
        failures.push({ url: baseUrl, reason: msg });
        await this.logs.write(
          'warn',
          'ollama',
          `chat fallo en ${baseUrl} - ${model}: ${msg}`,
        );

        // "model not found" (404) en un servidor: probar siguiente para ver
        // si lo tiene en otro lado, pero recordar el error.
        const isModelNotFound =
          status === 404 || /not found|no such model/i.test(msg);

        const isTransient =
          err?.code === 'ECONNREFUSED' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'ENOTFOUND' ||
          err?.code === 'ECONNABORTED' ||
          err?.code === 'EAI_AGAIN' ||
          isModelNotFound;

        if (!isTransient) break;
      }
    }

    this.recordError();
    // Si TODOS los servidores fallaron con "not found" → mensaje claro
    const allNotFound =
      failures.length > 0 &&
      failures.every((f) => /not found|no such model/i.test(f.reason));
    if (allNotFound) {
      throw new Error(
        `El modelo "${model}" no existe en ningun servidor Ollama configurado. ` +
          `Hazlo: en la maquina del servidor primario ejecuta: ollama pull ${model}`,
      );
    }
    // Si hay mezcla de errores, devolver el del primario (suele ser el mas relevante)
    const primaryFail = failures.find((f) => f.url === primary);
    const msg = primaryFail
      ? `${primary}: ${primaryFail.reason}`
      : failures[failures.length - 1]?.reason || 'error desconocido';
    throw new Error(msg);
  }

  async generate(model: string, prompt: string): Promise<string> {
    const baseUrl = await this.getActiveBaseUrl();
    try {
      const { data } = await this.clientFor(baseUrl).post('/api/generate', {
        model,
        prompt,
        stream: false,
      });
      return (data?.response ?? '').trim();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err.message;
      throw new Error(msg);
    }
  }

  private recordLatency(ms: number) {
    this.latencyWindow.push(ms);
    if (this.latencyWindow.length > 100) this.latencyWindow.shift();
  }
  private recordError() {
    const now = Date.now();
    this.errorsWindow.push(now);
    this.errorsWindow = this.errorsWindow.filter((t) => now - t < 5 * 60_000);
  }

  metrics() {
    const w = [...this.latencyWindow].sort((a, b) => a - b);
    const p = (q: number) =>
      w.length ? w[Math.min(Math.floor(q * w.length), w.length - 1)] : null;
    return {
      activeUrl: this.activeUrl,
      samples: w.length,
      p50: p(0.5),
      p95: p(0.95),
      p99: p(0.99),
      max: w.length ? w[w.length - 1] : null,
      errors5m: this.errorsWindow.length,
    };
  }
}
