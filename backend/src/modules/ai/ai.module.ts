import { Global, Module } from '@nestjs/common';
import { AiService } from './ai.service';

/**
 * Módulo global. Expone `AiService` como única dependencia para el resto
 * del backend. Internamente decide si enrutar a Ollama (default) o a
 * OpenAI / compatibles según `aiProvider` guardado en Settings.
 *
 * El módulo Ollama se mantiene en paralelo porque varios endpoints
 * (Settings → Ollama, Models, métricas) siguen consultándolo directamente.
 */
@Global()
@Module({
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
