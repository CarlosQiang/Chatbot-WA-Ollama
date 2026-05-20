import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('system')
@Controller('system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get()
  overview() {
    return this.system.overview();
  }

  @Get('memory')
  mem() {
    return this.system.memory();
  }

  @Get('cpu')
  cpu() {
    return this.system.cpu();
  }

  @Get('disk')
  disk() {
    return this.system.disk();
  }

  @Get('temperature')
  temp() {
    return this.system.temperature();
  }

  @Get('uptime')
  uptime() {
    return this.system.uptime();
  }

  @Get('ip')
  ip() {
    return { local: this.system.localIps() };
  }

  @Get('ip/public')
  async publicIp() {
    return this.system.publicIp();
  }
}
