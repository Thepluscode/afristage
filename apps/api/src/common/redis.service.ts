import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  // lazyConnect so the app boots even if Redis is briefly unavailable; readiness
  // probe surfaces the real state. Bounded so the probe fails fast when Redis is down.
  private readonly client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null // don't reconnect-storm; each ping reconnects on demand
  });

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
