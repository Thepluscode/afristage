import { NotFoundException } from '@nestjs/common';
import { FraudService } from './fraud.service';

function build() {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    giftTransaction: {
      groupBy: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: 0 } })
    }
  };
  return { service: new FraudService(prisma), prisma };
}

const old = new Date(Date.now() - 40 * 86_400_000); // 40-day-old account

describe('FraudService.assessCreator', () => {
  it('throws NotFound for an unknown user', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.assessCreator('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assesses a creator with no gift history (empty supporters)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'c1', createdAt: old });
    const res = await service.assessCreator('c1');
    expect(prisma.giftTransaction.findFirst).not.toHaveBeenCalled(); // no top supporters -> no reciprocal lookup
    expect(res.features).toMatchObject({ totalGiftIncomeCoins: 0, topSupporterCoins: 0, topSupporterIsReciprocated: false });
    expect(res.userId).toBe('c1');
  });

  it('flags a reciprocated top supporter and computes income features', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'c1', createdAt: old });
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { viewerId: 's1', _sum: { totalCoinAmount: 800 } },
      { viewerId: 's2', _sum: { totalCoinAmount: 200 } }
    ]);
    prisma.giftTransaction.findFirst.mockResolvedValue({ id: 'gt-back' }); // creator gifted a top supporter back
    prisma.giftTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 500 } }) // last 24h
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 700 } }); // baseline window

    const res = await service.assessCreator('c1');
    expect(prisma.giftTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ viewerId: 'c1', creatorId: { in: ['s1', 's2'] } }) })
    );
    expect(res.features).toMatchObject({
      totalGiftIncomeCoins: 1000,
      topSupporterCoins: 800,
      topSupporterIsReciprocated: true,
      last24hIncomeCoins: 500,
      dailyBaselineCoins: 100 // 700 / 7
    });
  });

  it('treats null aggregate sums as zero (no NaN leaking into features)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'c1', createdAt: old });
    prisma.giftTransaction.groupBy.mockResolvedValue([{ viewerId: 's1', _sum: { totalCoinAmount: null } }]);
    prisma.giftTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: null } }) // last 24h
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: null } }); // baseline
    const res = await service.assessCreator('c1');
    expect(res.features).toMatchObject({
      totalGiftIncomeCoins: 0,
      topSupporterCoins: 0,
      last24hIncomeCoins: 0,
      dailyBaselineCoins: 0
    });
  });
});

describe('FraudService.assessGroup', () => {
  function groupBuild() {
    const prisma: any = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      giftTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: 0 } }) }
    };
    return { service: new FraudService(prisma), prisma };
  }
  const oldDate = new Date(Date.now() - 40 * 86_400_000);
  const freshDate = new Date(Date.now() - 1 * 86_400_000);

  it('rejects fewer than 2 distinct ids (after dedup) and oversized groups', async () => {
    const { service } = groupBuild();
    await expect(service.assessGroup(['a'])).rejects.toThrow('at least 2');
    await expect(service.assessGroup(['a', 'a'])).rejects.toThrow('at least 2'); // dedup first
    await expect(service.assessGroup(Array.from({ length: 201 }, (_, i) => `u${i}`))).rejects.toThrow('max 200');
  });

  it('rejects when fewer than 2 of the ids exist', async () => {
    const { service, prisma } = groupBuild();
    prisma.user.findMany.mockResolvedValue([{ id: 'a', createdAt: oldDate }]);
    await expect(service.assessGroup(['a', 'ghost'])).rejects.toThrow('Fewer than 2');
  });

  it('computes group features: young share + internal/total volume + internal spike windows', async () => {
    const { service, prisma } = groupBuild();
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', createdAt: oldDate },
      { id: 'b', createdAt: freshDate },
      { id: 'c', createdAt: freshDate }
    ]);
    prisma.giftTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 100_000 } }) // total involving group
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 80_000 } }) // internal
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 7_000 } }) // internal last 24h
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 7_000 } }); // internal baseline window

    const res = await service.assessGroup(['a', 'b', 'c']);
    expect(res.userIds.sort()).toEqual(['a', 'b', 'c']);
    expect(res.features).toMatchObject({
      memberCount: 3,
      youngMemberCount: 2,
      totalGiftCoins: 100_000,
      internalGiftCoins: 80_000,
      last24hInternalCoins: 7_000,
      dailyBaselineInternalCoins: 1_000 // 7000 / 7
    });
    // internal aggregates must constrain BOTH sides to the member set
    const internalCall = prisma.giftTransaction.aggregate.mock.calls[1][0];
    expect(internalCall.where).toMatchObject({ viewerId: { in: ['a', 'b', 'c'] }, creatorId: { in: ['a', 'b', 'c'] } });
    // wash-heavy group -> internalGifting triggered
    expect(res.signals.find((s: any) => s.key === 'internalGifting')?.triggered).toBe(true);
  });

  it('treats null aggregate sums as zero', async () => {
    const { service, prisma } = groupBuild();
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', createdAt: oldDate },
      { id: 'b', createdAt: oldDate }
    ]);
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: null } });
    const res = await service.assessGroup(['a', 'b']);
    expect(res.features).toMatchObject({ totalGiftCoins: 0, internalGiftCoins: 0, last24hInternalCoins: 0, dailyBaselineInternalCoins: 0 });
    expect(res.recommendedAction).toBe('NONE');
  });
});
