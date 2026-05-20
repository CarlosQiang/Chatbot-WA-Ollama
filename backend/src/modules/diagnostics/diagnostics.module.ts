import { Module } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { DiagnosticsController } from './diagnostics.controller';

@Module({
  providers: [DiagnosticsService],
  controllers: [DiagnosticsController],
})
export class DiagnosticsModule {}
