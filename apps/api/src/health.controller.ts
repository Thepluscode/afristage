import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './common/redis.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  // Liveness: process is up. Cheap, no dependencies.
  @Get()
  health() {
    return { status: 'ok', service: 'afristage-api' };
  }

  // Readiness: can we actually serve traffic? Checks DB + Redis. 503 if any is down.
  @Get('ready')
  async ready() {
    const checks = { db: false, redis: false };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = true;
    } catch {
      /* db down */
    }
    try {
      checks.redis = await this.redis.ping();
    } catch {
      /* redis down */
    }
    if (!checks.db || !checks.redis) throw new ServiceUnavailableException({ status: 'not_ready', checks });
    return { status: 'ready', checks };
  }
}
