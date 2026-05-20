import { Global, Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { MessagePoller } from './poller.service';

@Global()
@Module({
  providers: [IngestService, MessagePoller],
  exports: [IngestService],
})
export class IngestModule {}
