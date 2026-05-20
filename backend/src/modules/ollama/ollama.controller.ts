import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OllamaService } from './ollama.service';
import { SettingsService } from '../settings/settings.service';

@ApiTags('models')
@Controller('models')
export class OllamaController {
  constructor(
    private readonly ollama: OllamaService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async list() {
    const models = await this.ollama.listModels();
    const active = await this.settings.getActiveModel();
    return { active, models };
  }

  /**
   * Devuelve los modelos disponibles en CADA servidor Ollama configurado
   * (primario + fallbacks). Cada entrada incluye la URL, estado y la lista
   * de modelos.
   */
  @Get('all')
  async listAll() {
    const primary = await this.settings.getOllamaBaseUrl();
    const fallback = await this.settings.getOllamaFallbackUrls();
    const urls = [primary, ...fallback.filter((u) => u !== primary)];
    const active = await this.settings.getActiveModel();

    const results = await Promise.all(
      urls.map(async (url, idx) => {
        const test = await this.ollama.testConnection(url);
        return {
          url,
          isPrimary: idx === 0,
          ok: test.ok,
          latencyMs: test.latencyMs,
          models: test.models || [],
          error: test.error,
        };
      }),
    );

    return { active, primary, servers: results };
  }

  @Post('select')
  async select(@Body() body: { model: string; url?: string }) {
    // Si el modelo viene con una URL distinta del primario, primero cambiamos
    // el primario y luego marcamos el modelo activo.
    if (body.url) {
      const currentPrimary = await this.settings.getOllamaBaseUrl();
      if (body.url !== currentPrimary) {
        const fallback = await this.settings.getOllamaFallbackUrls();
        const newFallback = fallback.filter((u) => u !== body.url);
        if (currentPrimary && !newFallback.includes(currentPrimary)) {
          newFallback.push(currentPrimary);
        }
        await this.settings.setOllamaBaseUrl(body.url, 'dashboard');
        await this.settings.setOllamaFallbackUrls(newFallback, 'dashboard');
        this.ollama.invalidateActiveUrl();
        this.ollama.invalidateModelsCache();
      }
    }
    await this.settings.setActiveModel(body.model, 'dashboard');
    return { active: body.model, primary: await this.settings.getOllamaBaseUrl() };
  }

  @Get('metrics')
  metrics() {
    return this.ollama.metrics();
  }

  @Post('refresh')
  async refresh() {
    this.ollama.invalidateActiveUrl();
    this.ollama.invalidateModelsCache();
    const health = await this.ollama.health();
    return { ok: true, health };
  }
}
