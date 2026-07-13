import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

// Global so any feature module (feed cache, future throttler storage) can
// inject the ONE shared client instead of each opening its own connection.
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
