import { Global, Module } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { MessagePoller } from './poller.service';
import { PendingContactsService } from './pending-contacts.service';
import { PendingContactsController } from './pending-contacts.controller';

@Global()
@Module({
  controllers: [PendingContactsController],
  providers: [IngestService, MessagePoller, PendingContactsService],
  exports: [IngestService, PendingContactsService],
})
export class IngestModule {}
