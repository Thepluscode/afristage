import { UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  afterEach(() => {
    delete process.env.METRICS_TOKEN;
  });

  it('serves the Prometheus exposition openly when no token is configured', async () => {
    const c = new MetricsController(new MetricsService());
    const body = await c.scrape({ headers: {} });
    expect(body).toContain('afristage_ledger_integrity_ok');
  });

  it('with METRICS_TOKEN set: rejects missing/wrong bearer, accepts the right one', async () => {
    process.env.METRICS_TOKEN = 's3cret';
    const c = new MetricsController(new MetricsService());
    expect(() => c.scrape({ headers: {} })).toThrow(UnauthorizedException);
    expect(() => c.scrape({ headers: { authorization: 'Bearer wrong' } })).toThrow(UnauthorizedException);
    await expect(c.scrape({ headers: { authorization: 'Bearer s3cret' } })).resolves.toContain('afristage_');
  });
});
