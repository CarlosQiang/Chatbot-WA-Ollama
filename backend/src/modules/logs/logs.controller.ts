import { Controller, Delete, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LogsService } from './logs.service';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('level') level?: string,
    @Query('source') source?: string,
  ) {
    return this.logs.list({
      limit: limit ? parseInt(limit, 10) : 100,
      level,
      source,
    });
  }

  @Delete()
  clear() {
    return this.logs.clear();
  }
}
