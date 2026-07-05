import { NotFoundException } from '@nestjs/common';
import { FraudService } from './fraud.service';

function build() {
  const prisma: any = {
    fraudAssessment: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
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

describe('FraudService cached + async scoring (R5 §9 #4)', () => {
  afterEach(() => {
    delete process.env.FRAUD_ASSESSMENT_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  const activeUser = { id: 'u1', createdAt: new Date(Date.now() - 30 * 86_400_000) };

  it('assessCreator persists the assessment (upsert with score + payload)', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    const res = await service.assessCreator('u1');
    const upsert = prisma.fraudAssessment.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ userId: 'u1' });
    expect(upsert.create.riskScore).toBe(res.riskScore);
    expect(upsert.create.payload.signals).toBeDefined();
    expect(upsert.update.computedAt).toBeInstanceOf(Date);
  });

  it('assessCreatorCached serves a fresh row without recomputing', async () => {
    const { service, prisma } = build();
    prisma.fraudAssessment.findUnique.mockResolvedValue({
      userId: 'u1', riskScore: 0.4, recommendedAction: 'MANUAL_REVIEW', computedAt: new Date()
    });
    const res = await service.assessCreatorCached('u1');
    expect(res).toEqual({ userId: 'u1', riskScore: 0.4, recommendedAction: 'MANUAL_REVIEW', cached: true });
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // no recompute
  });

  it('assessCreatorCached recomputes when the row is stale or missing', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    prisma.fraudAssessment.findUnique.mockResolvedValue({
      userId: 'u1', riskScore: 0.9, recommendedAction: 'PAYOUT_HOLD', computedAt: new Date(Date.now() - 3_600_000)
    });
    const stale = await service.assessCreatorCached('u1');
    expect(stale.cached).toBe(false);
    prisma.fraudAssessment.findUnique.mockResolvedValue(null);
    const missing = await service.assessCreatorCached('u1');
    expect(missing.cached).toBe(false);
  });

  it('TTL=0 disables the cache and a garbage TTL falls back to the default', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    process.env.FRAUD_ASSESSMENT_TTL_SECONDS = '0';
    await service.assessCreatorCached('u1');
    expect(prisma.fraudAssessment.findUnique).not.toHaveBeenCalled(); // straight to recompute
    process.env.FRAUD_ASSESSMENT_TTL_SECONDS = 'garbage';
    prisma.fraudAssessment.findUnique.mockResolvedValue({
      userId: 'u1', riskScore: 0.1, recommendedAction: 'NONE', computedAt: new Date()
    });
    const res = await service.assessCreatorCached('u1');
    expect(res.cached).toBe(true); // default 300s TTL applied
  });

  it('queueReassess coalesces per user and swallows failures', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(activeUser);
    const spy = jest.spyOn(service, 'assessCreator');
    service.queueReassess('u1');
    service.queueReassess('u1'); // coalesced while pending
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    expect(spy).toHaveBeenCalledTimes(1);
    // after settling, a new event re-queues
    service.queueReassess('u1');
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    expect(spy).toHaveBeenCalledTimes(2);
    // failure path: never throws out of the queue
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    spy.mockRejectedValue(new Error('db down'));
    service.queueReassess('u2');
    await new Promise(setImmediate);
    await new Promise(setImmediate);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('fraud re-score failed for u2'));
  });
});
