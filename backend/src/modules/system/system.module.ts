import { Global, Module } from '@nestjs/common';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';

@Global()
@Module({
  providers: [SystemService],
  controllers: [SystemController],
  exports: [SystemService],
})
export class SystemModule {}
