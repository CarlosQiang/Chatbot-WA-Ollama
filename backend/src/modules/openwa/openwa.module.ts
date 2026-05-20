import { Global, Module } from '@nestjs/common';
import { OpenWaService } from './openwa.service';
import { OpenWaController } from './openwa.controller';

@Global()
@Module({
  providers: [OpenWaService],
  controllers: [OpenWaController],
  exports: [OpenWaService],
})
export class OpenWaModule {}
