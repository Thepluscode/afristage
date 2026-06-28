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
