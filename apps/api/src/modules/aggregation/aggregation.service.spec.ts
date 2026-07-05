import { AggregationService, windowSince } from './aggregation.service';

function build() {
  const prisma: any = {
    giftTransaction: {
      groupBy: jest.fn().mockResolvedValue([]),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: null } })
    },
    missionClaim: { aggregate: jest.fn().mockResolvedValue({ _sum: { rewardCoins: null } }) },
    profile: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { agg: new AggregationService(prisma), prisma };
}

describe('windowSince', () => {
  it('maps day to start-of-today, week to a rolling 7d bound, all to none', () => {
    const day = windowSince('day')!;
    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
    const week = windowSince('week')!;
    expect(Date.now() - week.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000 - 5_000);
    expect(windowSince('all')).toBeUndefined();
    expect(windowSince(undefined)).toBeUndefined();
  });
});

describe('AggregationService.giftTotals', () => {
  it('groups by the key with deterministic order, window bounds and clamped take', async () => {
    const { agg, prisma } = build();
    const since = new Date(1000);
    const until = new Date(2000);
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 'a', _sum: { totalCoinAmount: 500, quantity: 2 }, _count: 3 },
      { viewerId: 'b', _sum: { totalCoinAmount: null, quantity: null }, _count: null } // null coercion
    ]);
    const rows = await agg.giftTotals({ by: 'viewerId', where: { roomId: 'r1' }, since, until, limit: 999, sumQuantity: true });
    expect(rows).toEqual([
      { key: 'a', totalCoins: 500, quantity: 2, txCount: 3 },
      { key: 'b', totalCoins: 0, quantity: 0, txCount: 0 }
    ]);
    const call = prisma.giftTransaction.groupBy.mock.calls[0][0];
    expect(call.by).toEqual(['viewerId']);
    expect(call.where).toEqual({ roomId: 'r1', createdAt: { gte: since, lte: until } });
    expect(call.orderBy).toEqual([{ _sum: { totalCoinAmount: 'desc' } }, { viewerId: 'asc' }]);
    expect(call.take).toBe(100); // clamped
    expect(call._sum).toEqual({ totalCoinAmount: true, quantity: true });
  });

  it('defaults: limit 20, no window clause, no quantity sum', async () => {
    const { agg, prisma } = build();
    await agg.giftTotals({ by: 'creatorId' });
    const call = prisma.giftTransaction.groupBy.mock.calls[0][0];
    expect(call.take).toBe(20);
    expect(call.where).toEqual({});
    expect(call._sum).toEqual({ totalCoinAmount: true });
    // falsy limit also falls back to 20; since-only window sets just gte
    await agg.giftTotals({ by: 'creatorId', limit: 0, since: new Date(5) });
    const second = prisma.giftTransaction.groupBy.mock.calls[1][0];
    expect(second.take).toBe(20);
    expect(second.where).toEqual({ createdAt: { gte: new Date(5) } });
    // until-only window sets just lte
    await agg.giftTotals({ by: 'creatorId', until: new Date(6) });
    expect(prisma.giftTransaction.groupBy.mock.calls[2][0].where).toEqual({ createdAt: { lte: new Date(6) } });
  });
});

describe('AggregationService sums', () => {
  it('sumGiftCoins scopes, windows, and coerces null to 0', async () => {
    const { agg, prisma } = build();
    expect(await agg.sumGiftCoins({ viewerId: { in: ['u1'] } }, new Date(9))).toBe(0);
    expect(prisma.giftTransaction.aggregate.mock.calls[0][0].where).toEqual({
      viewerId: { in: ['u1'] },
      createdAt: { gte: new Date(9) }
    });
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: 42 } });
    expect(await agg.sumGiftCoins({})).toBe(42);
    expect(prisma.giftTransaction.aggregate.mock.calls[1][0].where).toEqual({});
  });

  it('sumMissionCoins short-circuits an empty member list and coerces nulls', async () => {
    const { agg, prisma } = build();
    expect(await agg.sumMissionCoins([])).toBe(0);
    expect(prisma.missionClaim.aggregate).not.toHaveBeenCalled();
    expect(await agg.sumMissionCoins(['u1'], new Date(9))).toBe(0);
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: 7 } });
    expect(await agg.sumMissionCoins(['u1'])).toBe(7);
    expect(prisma.missionClaim.aggregate.mock.calls[1][0].where).toEqual({ userId: { in: ['u1'] } });
  });
});

describe('AggregationService.profilesFor', () => {
  it('short-circuits empty input and maps safe public fields', async () => {
    const { agg, prisma } = build();
    expect((await agg.profilesFor([])).size).toBe(0);
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
    prisma.profile.findMany.mockResolvedValue([
      { userId: 'u1', displayName: 'Ada', username: 'ada', avatarUrl: 'http://a' }
    ]);
    const map = await agg.profilesFor(['u1', 'u2']);
    expect(map.get('u1')).toEqual({ displayName: 'Ada', username: 'ada', avatarUrl: 'http://a' });
    expect(map.get('u2')).toBeUndefined();
  });
});
