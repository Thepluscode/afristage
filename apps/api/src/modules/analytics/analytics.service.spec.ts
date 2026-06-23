import { AnalyticsService } from './analytics.service';

function build() {
  const prisma: any = {
    user: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { svc: new AnalyticsService(prisma), prisma };
}

// Build a UTC Date offset from the current day so tests don't depend on a clock seam.
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0); // midday avoids DST/boundary edge cases
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

describe('AnalyticsService.dailySeries', () => {
  it('returns one gap-filled bucket per day (zero days included)', async () => {
    const { svc } = build();
    const series = await svc.dailySeries(7);
    expect(series).toHaveLength(7);
    expect(series.every((b) => b.newUsers === 0 && b.giftCount === 0 && b.giftVolumeCoins === 0)).toBe(true);
    // ascending, contiguous days
    expect(series[6].day > series[0].day).toBe(true);
  });

  it('buckets signups and gift volume into their UTC day', async () => {
    const { svc, prisma } = build();
    const today = daysAgo(0);
    const twoAgo = daysAgo(2);
    prisma.user.findMany.mockResolvedValue([{ createdAt: today }, { createdAt: today }, { createdAt: twoAgo }]);
    prisma.giftTransaction.findMany.mockResolvedValue([
      { createdAt: today, totalCoinAmount: 50 },
      { createdAt: today, totalCoinAmount: 70 }
    ]);
    const series = await svc.dailySeries(7);
    const byDay = Object.fromEntries(series.map((b) => [b.day, b]));
    expect(byDay[keyOf(today)]).toMatchObject({ newUsers: 2, giftCount: 2, giftVolumeCoins: 120 });
    expect(byDay[keyOf(twoAgo)]).toMatchObject({ newUsers: 1, giftCount: 0, giftVolumeCoins: 0 });
  });

  it('bounds the window to 1..365 days', async () => {
    const { svc } = build();
    expect(await svc.dailySeries(9999)).toHaveLength(365);
    expect(await svc.dailySeries(0)).toHaveLength(30); // 0 -> default 30
    expect(await svc.dailySeries(-5)).toHaveLength(1); // clamped up to 1
  });
});
