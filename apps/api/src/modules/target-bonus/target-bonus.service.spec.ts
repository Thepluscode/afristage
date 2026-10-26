import { BadRequestException } from '@nestjs/common';
import { AggregationService } from '../aggregation/aggregation.service';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { monthOf, monthWindow, TargetBonusService, tierFor } from './target-bonus.service';

const TIERS = [
  { minGiftCoins: 10_000, bonusCoins: 500 },
  { minGiftCoins: 50_000, bonusCoins: 3_000 }
];

function build(opts: { promo?: bigint; tiers?: typeof TIERS; groups?: { creatorId: string; coins: number }[]; paid?: any } = {}) {
  const prisma: any = {
    targetBonusTier: {
      findMany: jest.fn().mockResolvedValue(opts.tiers ?? TIERS),
      deleteMany: jest.fn().mockReturnValue('deleteMany'),
      createMany: jest.fn().mockReturnValue('createMany')
    },
    $transaction: jest.fn().mockResolvedValue([]),
    giftTransaction: {
      groupBy: jest.fn().mockResolvedValue((opts.groups ?? []).map((g) => ({ creatorId: g.creatorId, _sum: { totalCoinAmount: g.coins } }))),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: 12_000 } })
    },
    ledgerTransaction: { findUnique: jest.fn().mockResolvedValue(opts.paid ?? null) },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    profile: { findMany: jest.fn().mockResolvedValue([]) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const wallet: any = {
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'acc-promo', balanceMinor: opts.promo ?? 1_000_000n }),
    ensureUserWallets: jest.fn().mockResolvedValue(undefined),
    account: jest.fn().mockImplementation((userId: string) => Promise.resolve({ id: `earn-${userId}` }))
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'ltx1' }) };
  const money = new MoneyService(prisma, ledger, wallet, new MetricsService());
  return { service: new TargetBonusService(prisma, money, wallet, new AggregationService(prisma)), prisma, wallet, ledger };
}

afterEach(() => jest.useRealTimers());
const at = (iso: string) => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(new Date(iso));

describe('month helpers', () => {
  it('windows a month as [first instant, first instant of next) in UTC, December rolling over', () => {
    expect(monthWindow('2026-10')).toEqual({ start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-11-01T00:00:00Z') });
    expect(monthWindow('2026-12').end).toEqual(new Date('2027-01-01T00:00:00Z'));
    expect(monthOf(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10');
  });

  it.each(['2026-13', '2026-00', '26-10', '2026-1', '', 'abc', '2026-10-01'])('rejects malformed month %p', (m) => {
    expect(() => monthWindow(m)).toThrow(BadRequestException);
  });
});

describe('tierFor (only the highest tier reached pays)', () => {
  it.each([
    [9_999, null],
    [10_000, 500],
    [49_999, 500],
    [50_000, 3_000],
    [9_000_000, 3_000],
    [0, null]
  ])('%p gift coins -> bonus %p', (coins, bonus) => {
    expect(tierFor(coins, TIERS)?.bonusCoins ?? null).toBe(bonus);
  });

  it('no ladder means no tier', () => {
    expect(tierFor(1_000_000, [])).toBeNull();
  });
});

describe('TargetBonusService.replaceTiers', () => {
  it('replaces the whole ladder in one transaction and audits it', async () => {
    const { service, prisma } = build();
    await service.replaceTiers('admin1', TIERS);
    expect(prisma.$transaction).toHaveBeenCalledWith(['deleteMany', 'createMany']);
    expect(prisma.targetBonusTier.createMany).toHaveBeenCalledWith({ data: TIERS });
    expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({ actorId: 'admin1', action: 'target_bonus.tiers_replaced' });
  });

  it('rejects two tiers with the same target', async () => {
    const { service, prisma } = build();
    await expect(
      service.replaceTiers('admin1', [
        { minGiftCoins: 10_000, bonusCoins: 1 },
        { minGiftCoins: 10_000, bonusCoins: 2 }
      ])
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('TargetBonusService.pay', () => {
  it('refuses a month that has not ended, one millisecond before it closes', async () => {
    at('2026-10-31T23:59:59.999Z');
    const { service, ledger } = build({ groups: [{ creatorId: 'h1', coins: 60_000 }] });
    await expect(service.pay('admin1', '2026-10')).rejects.toBeInstanceOf(BadRequestException);
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('pays each qualifying host the highest tier reached, from PROMO, in one guarded post', async () => {
    at('2026-11-01T00:00:00Z');
    const { service, ledger, prisma } = build({
      groups: [
        { creatorId: 'h-small', coins: 10_000 },
        { creatorId: 'h-big', coins: 50_000 }
      ]
    });
    await service.pay('admin1', '2026-10');

    const window = prisma.giftTransaction.groupBy.mock.calls[0][0];
    expect(window.where.createdAt).toEqual({ gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') });
    expect(window.having).toEqual({ totalCoinAmount: { _sum: { gte: 10_000 } } });

    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.type).toBe('TARGET_BONUS');
    expect(post.idempotencyKey).toBe('target-bonus:2026-10');
    expect(post.guardNonNegative).toEqual(['acc-promo']);
    expect(post.entries).toEqual([
      { accountId: 'acc-promo', direction: 'DEBIT', amountMinor: 3_500, currency: 'COIN' },
      { accountId: 'earn-h-big', direction: 'CREDIT', amountMinor: 3_000, currency: 'COIN' },
      { accountId: 'earn-h-small', direction: 'CREDIT', amountMinor: 500, currency: 'COIN' }
    ]);
    expect(post.metadata.awards).toEqual([
      { userId: 'h-big', giftCoins: 50_000, bonusCoins: 3_000 },
      { userId: 'h-small', giftCoins: 10_000, bonusCoins: 500 }
    ]);
    expect(prisma.adminAuditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'target_bonus.paid', target: '2026-10' });
  });

  it('an underfunded promo budget pays nobody', async () => {
    at('2026-11-02T00:00:00Z');
    const { service, ledger } = build({ promo: 3_499n, groups: [{ creatorId: 'h1', coins: 50_000 }, { creatorId: 'h2', coins: 10_000 }] });
    await expect(service.pay('admin1', '2026-10')).rejects.toThrow('needs 3500');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('a month already paid is never paid again — it returns the original awards', async () => {
    at('2026-12-01T00:00:00Z');
    const original = [{ userId: 'h1', giftCoins: 50_000, bonusCoins: 3_000 }];
    const { service, ledger } = build({
      paid: { id: 'ltx-old', createdAt: new Date('2026-11-01T09:00:00Z'), metadata: { month: '2026-10', awards: original } },
      // the ladder changed since: a recomputation would differ
      tiers: [{ minGiftCoins: 1, bonusCoins: 99_999 }],
      groups: [{ creatorId: 'h1', coins: 50_000 }, { creatorId: 'h2', coins: 5 }]
    });
    const res = await service.pay('admin1', '2026-10');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
    expect(res.alreadyPaid).toBe(true);
    expect(res.paid).toEqual({ ledgerTransactionId: 'ltx-old', paidAt: '2026-11-01T09:00:00.000Z' });
    expect(res.awards.map(({ userId, bonusCoins }) => ({ userId, bonusCoins }))).toEqual([{ userId: 'h1', bonusCoins: 3_000 }]);
  });

  it('no ladder configured is an error, not a silent zero-pay', async () => {
    at('2026-11-02T00:00:00Z');
    const { service, ledger } = build({ tiers: [] });
    await expect(service.pay('admin1', '2026-10')).rejects.toThrow('No bonus tiers');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('nobody qualifying posts nothing and records no payment', async () => {
    at('2026-11-02T00:00:00Z');
    const { service, ledger } = build({ groups: [] });
    const res = await service.pay('admin1', '2026-10');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
    expect(res).toMatchObject({ paid: null, awards: [], totalBonusCoins: 0 });
  });
});

describe('TargetBonusService.me', () => {
  it('shows this month progress toward the next tier', async () => {
    at('2026-10-26T12:00:00Z');
    const { service, prisma } = build();
    const res = await service.me('h1');
    expect(prisma.giftTransaction.aggregate.mock.calls[0][0].where).toEqual({
      creatorId: 'h1',
      createdAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') }
    });
    expect(res).toMatchObject({
      month: '2026-10',
      giftCoins: 12_000,
      reachedTier: { minGiftCoins: 10_000, bonusCoins: 500 },
      nextTier: { minGiftCoins: 50_000, bonusCoins: 3_000 },
      coinsToNextTier: 38_000
    });
  });

  it('reads past bonuses only from this host\'s EARNING credits of type TARGET_BONUS', async () => {
    at('2026-10-26T12:00:00Z');
    const { service, prisma } = build();
    prisma.ledgerEntry.findMany.mockResolvedValue([
      {
        amountMinor: 500n,
        transaction: {
          createdAt: new Date('2026-10-01T08:00:00Z'),
          metadata: { month: '2026-09', awards: [{ userId: 'other', giftCoins: 1, bonusCoins: 1 }, { userId: 'h1', giftCoins: 11_000, bonusCoins: 500 }] }
        }
      }
    ]);
    const res = await service.me('h1');
    const where = prisma.ledgerEntry.findMany.mock.calls[0][0].where;
    expect(where.account).toEqual({ userId: 'h1', accountType: 'EARNING', currency: 'COIN' });
    expect(where.transaction).toEqual({ type: 'TARGET_BONUS' });
    expect(res.history).toEqual([{ month: '2026-09', bonusCoins: 500, giftCoins: 11_000, paidAt: '2026-10-01T08:00:00.000Z' }]);
  });
});
