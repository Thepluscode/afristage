import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  // Logged once per outage/recovery transition, not per failed op (Rule 8
  // evidence without per-request log spam while Redis is down).
  private degraded = false;

  // lazyConnect so the app boots even if Redis is briefly unavailable; readiness
  // probe surfaces the real state. Bounded so the probe fails fast when Redis is down.
  private readonly client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null // don't reconnect-storm; each ping reconnects on demand
  });

  // Best-effort cache ops: any Redis failure degrades to `null` (a cache miss),
  // never an error — the cache is optional and must not break reads (Rule 9).
  private async exec<T>(op: (client: Redis) => Promise<T>): Promise<T | null> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
      const out = await op(this.client);
      if (this.degraded) {
        this.degraded = false;
        this.logger.log('redis recovered; cache ops restored');
      }
      return out;
    } catch (err) {
      if (!this.degraded) {
        this.degraded = true;
        this.logger.warn(`redis unavailable, cache ops degrade to miss: ${(err as Error).message}`);
      }
      return null;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.exec((c) => c.get(key));
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.exec((c) => c.setex(key, ttlSeconds, value));
  }

  async incr(key: string): Promise<void> {
    await this.exec((c) => c.incr(key));
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status !== 'ready') await this.client.connect();
    } catch {
      return false;
    }
    const res = await this.client.ping();
    return res === 'PONG';
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => {});
  }
}
