import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

// The business-metric alert the infra dashboards can't give you: your server can
// be perfectly healthy while revenue has silently stopped. Every few minutes we
// compare, over a trailing window, how many customers STARTED a card checkout
// against how many payments SETTLED. When customers are trying to pay
// (checkouts >= a floor) but ZERO settle, the payment pipeline is broken even
// though /health is green — so we log at ERROR, flip a scrapeable gauge, and
// (if configured) POST an alert webhook. This is the "payments dropped to zero
// while sign-ups look normal" detector.
//
// ponytail: an in-app cron + two COUNT queries — no external Prometheus/
// Alertmanager to run. Graduate to rules-on-scrape if this ever needs
// multi-window/percentile logic.

const WINDOW_MIN = clampInt(process.env.REVENUE_ALERT_WINDOW_MIN, 60, 5, 1440);
// How many checkout attempts must exist in the window before "zero settled" is
// alarming — guards against false alarms in genuinely quiet hours.
const MIN_CHECKOUTS = clampInt(process.env.REVENUE_ALERT_MIN_CHECKOUTS, 3, 1, 100000);

export function clampInt(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || raw === '' || raw === undefined) return def;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

@Injectable()
export class RevenueMonitorService {
  private readonly logger = new Logger(RevenueMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledCheck() {
    try {
      await this.check();
    } catch (e: any) {
      // Monitoring must never take the app down; a failed check just skips a beat.
      this.logger.error(`Revenue monitor check failed: ${e?.message ?? e}`);
    }
  }

  // Counts sign-ups, card checkouts started, and payments settled over the
  // trailing window, decides whether revenue has silently stalled, records the
  // gauges, and alerts on a stall. `now` is injectable for deterministic tests.
  async check(now = new Date()): Promise<{ alerting: boolean; signups: number; checkouts: number; payments: number }> {
    const since = new Date(now.getTime() - WINDOW_MIN * 60_000);

    const [signups, checkouts, payments] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      // Card checkouts started in the window (real providers, not the mock path).
      this.prisma.paymentIntent.count({
        where: { createdAt: { gte: since }, provider: { in: ['paystack', 'stripe'] } }
      }),
      // Payments that actually settled in the window.
      this.prisma.paymentIntent.count({
        where: { updatedAt: { gte: since }, status: PaymentStatus.SUCCEEDED }
      })
    ]);

    const alerting = checkouts >= MIN_CHECKOUTS && payments === 0;
    this.metrics.recordRevenue({ alerting, signups, checkouts, payments });

    if (alerting) {
      const msg =
        `REVENUE ALERT: ${checkouts} card checkout(s) started in the last ${WINDOW_MIN}m but ` +
        `ZERO payments settled (sign-ups ${signups}). The payment pipeline may be broken while the ` +
        `server looks healthy — check the provider/webhook path now.`;
      this.logger.error(msg);
      await this.postAlert(msg);
    }
    return { alerting, signups, checkouts, payments };
  }

  // Optional Slack/webhook alert — absence must not break the check (Rule 9).
  private async postAlert(text: string): Promise<void> {
    const url = process.env.REVENUE_ALERT_WEBHOOK_URL;
    if (!url) return;
    try {
      const ctrl = new AbortController();
      // Defensive per-request timeout; only fires on a real ~5s stall.
      const timer = setTimeout(/* istanbul ignore next */ () => ctrl.abort(), 5_000);
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: ctrl.signal
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      this.logger.warn(`Revenue alert webhook POST failed: ${e?.message ?? e}`);
    }
  }
}
