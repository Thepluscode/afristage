import { Logger } from '@nestjs/common';
import { clampInt, RevenueMonitorService } from './revenue-monitor.service';

// Fake prisma: user.count + paymentIntent.count driven by the three window totals.
function build(counts: { signups: number; checkouts: number; payments: number }) {
  const prisma: any = {
    user: { count: jest.fn().mockResolvedValue(counts.signups) },
    // paymentIntent.count is called twice: first for checkouts (createdAt filter),
    // then for payments (status SUCCEEDED). Distinguish by the where shape.
    paymentIntent: {
      count: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.status === 'SUCCEEDED' ? counts.payments : counts.checkouts)
      )
    }
  };
  const metrics: any = { recordRevenue: jest.fn() };
  return { svc: new RevenueMonitorService(prisma, metrics), prisma, metrics };
}

describe('clampInt (safe threshold defaults)', () => {
  it('returns the default for missing / empty / non-numeric input', () => {
    expect(clampInt(undefined, 60, 5, 1440)).toBe(60);
    expect(clampInt('', 60, 5, 1440)).toBe(60);
    expect(clampInt('abc', 60, 5, 1440)).toBe(60);
  });
  it('clamps below-min and above-max, truncates, and passes valid values', () => {
    expect(clampInt('0', 3, 1, 100)).toBe(1); // below min
    expect(clampInt('9999', 3, 1, 100)).toBe(100); // above max
    expect(clampInt('12.9', 60, 5, 1440)).toBe(12); // truncated, in range
  });
});

describe('RevenueMonitorService.check (revenue-drop detector)', () => {
  it('ALERTS when checkouts >= floor but zero payments settled', async () => {
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc, metrics } = build({ signups: 8, checkouts: 5, payments: 0 });
    const r = await svc.check(new Date());
    expect(r).toEqual({ alerting: true, signups: 8, checkouts: 5, payments: 0 });
    expect(metrics.recordRevenue).toHaveBeenCalledWith({ alerting: true, signups: 8, checkouts: 5, payments: 0 });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('REVENUE ALERT'));
    errSpy.mockRestore();
  });

  it('does NOT alert when payments are settling (default now())', async () => {
    const { svc, metrics } = build({ signups: 8, checkouts: 5, payments: 2 });
    const r = await svc.check(); // no arg → exercises the `now = new Date()` default
    expect(r.alerting).toBe(false);
    expect(metrics.recordRevenue).toHaveBeenCalledWith(expect.objectContaining({ alerting: false }));
  });

  it('does NOT alert below the checkout floor (a genuinely quiet hour)', async () => {
    const { svc } = build({ signups: 1, checkouts: 1, payments: 0 }); // 1 < MIN_CHECKOUTS(3)
    expect((await svc.check(new Date())).alerting).toBe(false);
  });

  it('queries the trailing window (since = now - window) for all three counts', async () => {
    const { svc, prisma } = build({ signups: 0, checkouts: 0, payments: 0 });
    const now = new Date('2026-07-21T12:00:00.000Z');
    await svc.check(now);
    const since = prisma.user.count.mock.calls[0][0].where.createdAt.gte as Date;
    expect(now.getTime() - since.getTime()).toBe(60 * 60_000); // default 60m window
  });
});

describe('RevenueMonitorService.postAlert (optional webhook, Rule 9)', () => {
  const OLD = process.env.REVENUE_ALERT_WEBHOOK_URL;
  afterEach(() => {
    process.env.REVENUE_ALERT_WEBHOOK_URL = OLD;
    jest.restoreAllMocks();
  });

  it('POSTs the alert when REVENUE_ALERT_WEBHOOK_URL is set', async () => {
    process.env.REVENUE_ALERT_WEBHOOK_URL = 'https://hooks.example/x';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc } = build({ signups: 8, checkouts: 5, payments: 0 });
    await svc.check(new Date());
    expect(fetchSpy).toHaveBeenCalledWith('https://hooks.example/x', expect.objectContaining({ method: 'POST' }));
  });

  it('does not POST when the webhook is unset', async () => {
    delete process.env.REVENUE_ALERT_WEBHOOK_URL;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { svc } = build({ signups: 8, checkouts: 5, payments: 0 });
    await svc.check(new Date());
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows a webhook POST failure (monitoring must not throw)', async () => {
    process.env.REVENUE_ALERT_WEBHOOK_URL = 'https://hooks.example/x';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc } = build({ signups: 8, checkouts: 5, payments: 0 });
    await expect(svc.check(new Date())).resolves.toBeTruthy();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('webhook POST failed'));
  });

  it('stringifies a non-Error webhook failure', async () => {
    process.env.REVENUE_ALERT_WEBHOOK_URL = 'https://hooks.example/x';
    jest.spyOn(global, 'fetch').mockRejectedValue('raw-string-failure');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { svc } = build({ signups: 8, checkouts: 5, payments: 0 });
    await svc.check(new Date());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('raw-string-failure'));
  });
});

describe('RevenueMonitorService.scheduledCheck (never throws)', () => {
  it('logs and swallows a check failure so the app stays up', async () => {
    const { svc } = build({ signups: 0, checkouts: 0, payments: 0 });
    jest.spyOn(svc, 'check').mockRejectedValue(new Error('db gone'));
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(svc.scheduledCheck()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Revenue monitor check failed'));
    errSpy.mockRestore();
  });

  it('runs check() on schedule when healthy', async () => {
    const { svc } = build({ signups: 0, checkouts: 0, payments: 0 });
    const checkSpy = jest.spyOn(svc, 'check').mockResolvedValue({ alerting: false, signups: 0, checkouts: 0, payments: 0 });
    await svc.scheduledCheck();
    expect(checkSpy).toHaveBeenCalledTimes(1);
  });

  it('stringifies a non-Error check failure', async () => {
    const { svc } = build({ signups: 0, checkouts: 0, payments: 0 });
    jest.spyOn(svc, 'check').mockRejectedValue('raw-db-failure');
    const errSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await svc.scheduledCheck();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('raw-db-failure'));
    errSpy.mockRestore();
  });
});
