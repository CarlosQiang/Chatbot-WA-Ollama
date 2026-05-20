import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis;

  async onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) return this.client.set(key, value, 'EX', ttlSec);
    return this.client.set(key, value);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async incr(key: string) {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSec: number) {
    return this.client.expire(key, ttlSec);
  }
}
