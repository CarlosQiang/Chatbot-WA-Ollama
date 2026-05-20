import { Global, Module } from '@nestjs/common';
import { ReminderService } from './reminder.service';
import { ReminderController } from './reminder.controller';

@Global()
@Module({
  providers: [ReminderService],
  controllers: [ReminderController],
  exports: [ReminderService],
})
export class ReminderModule {}
