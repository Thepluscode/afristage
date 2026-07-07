import { Controller, Get, Header, Req, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from './metrics.service';

// Prometheus scrape endpoint. Open by default (private-network scrapers);
// set METRICS_TOKEN to require `Authorization: Bearer <token>` — Prometheus
// supports this natively via scrape_configs.authorization.
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  scrape(@Req() req: any): Promise<string> {
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers?.authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException('Metrics token required');
    }
    return this.metrics.render();
  }
}
