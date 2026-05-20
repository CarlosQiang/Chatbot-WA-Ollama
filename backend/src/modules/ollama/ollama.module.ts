import { Global, Module } from '@nestjs/common';
import { OllamaService } from './ollama.service';
import { OllamaController } from './ollama.controller';

@Global()
@Module({
  providers: [OllamaService],
  controllers: [OllamaController],
  exports: [OllamaService],
})
export class OllamaModule {}
