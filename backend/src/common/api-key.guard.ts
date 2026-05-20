import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPlaceholderApiKey } from './validators';

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private warnedOpenMode = false;

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = process.env.BACKEND_API_KEY;
    const req = ctx.switchToHttp().getRequest();
    const ip: string =
      req.ip ||
      req.headers?.['x-real-ip'] ||
      req.connection?.remoteAddress ||
      '';

    const isLoopback = LOOPBACK.has(ip) || ip.startsWith('127.') || ip === '::1';

    if (isPlaceholderApiKey(required)) {
      if (!this.warnedOpenMode) {
        this.warnedOpenMode = true;
        this.logger.warn('BACKEND_API_KEY no configurada o es sentinela. Solo loopback aceptado.');
      }
      if (isLoopback) return true;
      throw new UnauthorizedException('API key requerida.');
    }

    const provided = req.headers['x-api-key'] || req.query?.api_key;
    if (provided && provided === required) return true;
    throw new UnauthorizedException('API key invalida');
  }
}
