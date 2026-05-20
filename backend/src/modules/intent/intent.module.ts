import { Global, Module } from '@nestjs/common';
import { IntentService } from './intent.service';

@Global()
@Module({
  providers: [IntentService],
  exports: [IntentService],
})
export class IntentModule {}
