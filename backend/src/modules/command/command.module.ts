import { Global, Module } from '@nestjs/common';
import { CommandService } from './command.service';

@Global()
@Module({
  providers: [CommandService],
  exports: [CommandService],
})
export class CommandModule {}
