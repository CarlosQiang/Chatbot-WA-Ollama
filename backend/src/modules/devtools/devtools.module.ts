import { Global, Module } from '@nestjs/common';
import { DevToolsService } from './devtools.service';

@Global()
@Module({
  providers: [DevToolsService],
  exports: [DevToolsService],
})
export class DevToolsModule {}
