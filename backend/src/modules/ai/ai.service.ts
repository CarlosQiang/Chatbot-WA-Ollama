import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { OllamaService, ChatMessage } from '../ollama/ollama.service';
import { SettingsService, AiProvider } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

/**
 * Capa de abstracción sobre proveedores IA.
 *
 * - Si `aiProvider == 'ollama'` (default) ─► delega TODO en OllamaService.
 *   Comportamiento idéntico al de antes; no hay cambios para usuarios que
 *   tenían el sistema funcionando con Ollama.
 * - Si `aiProvider == 'openai'` ─► usa la Chat Completions API estándar
 *   (OpenAI o compatibles como OpenRouter, Together, Groq, etc) leyendo
 *   `openaiApiKey`, `openaiBaseUrl` y `openaiModel` de SettingsService.
 *
 * Toda la elección se hace por chat() — los call sites (chat, notes,
 * reminder) no tienen que saber qué proveedor está activo.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openaiClients = new Map<string, AxiosInstance>();

  constructor(
    private readonly ollama: OllamaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  /**
   * Punto único de entrada para el resto del backend. Devuelve la
   * respuesta como texto plano (sin streaming).
   */
  async chat(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number } = {},
  ): Promise<string> {
    const provider = await this.settings.getAiProvider();
    if (provider === 'openai') {
      return this.openaiChat(messages, opts);
    }
    // Default: Ollama. Mantiene 100% el comportamiento anterior.
    const model = opts.model || (await this.settings.getActiveModel());
    return this.ollama.chat(model, messages);
  }

  /**
   * Igual que chat() pero específico para "una sola pasada de texto".
   * Usado por los flujos de organizar notas y parsear recordatorios.
   */
  async complete(systemPrompt: string, userText: string): Promise<string> {
    return this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userText },
    ]);
  }

  /**
   * Información para mostrar en el dashboard de qué proveedor está activo.
   */
  async info(): Promise<{
    provider: AiProvider;
    model: string;
    temperature: number;
    openaiConfigured: boolean;
    openaiBaseUrl: string;
  }> {
    const provider = await this.settings.getAiProvider();
    const temperature = await this.settings.getAiTemperature();
    const openaiKey = await this.settings.getOpenAiApiKey();
    const openaiModel = await this.settings.getOpenAiModel();
    const openaiBase = await this.settings.getOpenAiBaseUrl();
    const ollamaModel = await this.settings.getActiveModel();
    return {
      provider,
      model: provider === 'openai' ? openaiModel : ollamaModel,
      temperature,
      openaiConfigured: !!openaiKey,
      openaiBaseUrl: openaiBase,
    };
  }

  // ─── OpenAI / OpenAI-compatible ────────────────────────────
  private clientFor(baseUrl: string, apiKey: string): AxiosInstance {
    const cacheKey = `${baseUrl}|${apiKey.slice(-8)}`;
    const cached = this.openaiClients.get(cacheKey);
    if (cached) return cached;
    const c = axios.create({
      baseURL: baseUrl,
      timeout: 120_000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
    this.openaiClients.set(cacheKey, c);
    return c;
  }

  private async openaiChat(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number },
  ): Promise<string> {
    const apiKey = await this.settings.getOpenAiApiKey();
    if (!apiKey) {
      throw new Error(
        'Proveedor IA = openai pero no hay OPENAI_API_KEY configurada. ' +
          'Ve a Ajustes → IA y pega tu clave, o cambia a proveedor Ollama.',
      );
    }
    const baseUrl = await this.settings.getOpenAiBaseUrl();
    const model = opts.model || (await this.settings.getOpenAiModel());
    const temperature =
      opts.temperature ?? (await this.settings.getAiTemperature());

    try {
      const { data } = await this.clientFor(baseUrl, apiKey).post(
        '/chat/completions',
        {
          model,
          messages,
          temperature,
          stream: false,
        },
      );
      const text: string = data?.choices?.[0]?.message?.content ?? '';
      return text.trim();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err.message;
      await this.logs.write('error', 'ollama', `OpenAI chat fallo (${model}): ${msg}`);
      throw new Error(`OpenAI: ${msg}`);
    }
  }

  /**
   * Pequeño health/test contra OpenAI sin gastar tokens — pide /models.
   */
  async testOpenAi(params?: {
    baseUrl?: string;
    apiKey?: string;
  }): Promise<{ ok: boolean; models?: string[]; error?: string; latencyMs?: number }> {
    const baseUrl = (params?.baseUrl || (await this.settings.getOpenAiBaseUrl())).trim();
    const apiKey = (params?.apiKey || (await this.settings.getOpenAiApiKey())).trim();
    if (!apiKey) return { ok: false, error: 'Sin OPENAI_API_KEY configurada.' };
    const t0 = Date.now();
    try {
      const { data } = await this.clientFor(baseUrl, apiKey).get('/models', {
        timeout: 10_000,
      });
      const models = (data?.data ?? []).map((m: any) => m.id).filter(Boolean);
      return { ok: true, models: models.slice(0, 50), latencyMs: Date.now() - t0 };
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err.message;
      return { ok: false, error: String(msg) };
    }
  }
}
