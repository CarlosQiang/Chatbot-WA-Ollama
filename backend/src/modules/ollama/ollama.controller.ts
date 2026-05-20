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

  @Post('select')
  async select(@Body() body: { model: string }) {
    await this.settings.setActiveModel(body.model, 'dashboard');
    return { active: body.model };
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
