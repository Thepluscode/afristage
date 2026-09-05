import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { RedisService } from './common/redis.service';

// The commit this process was built from, put on the wire so a deploy can be
// PROVEN rather than assumed.
//
// It exists because the deployed API served pre-2026-08-11 code for roughly four
// weeks while every green check agreed things were fine — the scheduled synthetic
// probe included, because it only ever asked whether the service answered. With
// no version on the wire, nothing could tell a stale deployment from a current
// one, and the only way it was eventually found was by probing for behaviour
// changes merged a month earlier. The deploy job now asserts this equals the
// commit it just pushed, so a deploy that silently did not happen goes red.
//
// `GIT_SHA` is what the deploy job sets. `RAILWAY_GIT_COMMIT_SHA` is Railway's
// own, present on git-triggered deploys. 'unknown' is honest rather than
// convenient: it says the build cannot account for itself.
export function commitSha(): string {
  return process.env.GIT_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown';
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  // Liveness: process is up. Cheap, no dependencies.
  @Get()
  health() {
    return { status: 'ok', service: 'afristage-api', commit: commitSha() };
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
