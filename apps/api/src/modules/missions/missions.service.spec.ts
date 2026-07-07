import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { MissionsService } from './missions.service';
import { MISSION_CATALOG, findMission, utcDay, utcDayStart } from './mission-catalog';

function build() {
  const prisma: any = {
    roomParticipant: { count: jest.fn().mockResolvedValue(0) },
    chatMessage: { count: jest.fn().mockResolvedValue(0) },
    follow: { count: jest.fn().mockResolvedValue(0) },
    giftTransaction: { count: jest.fn().mockResolvedValue(0) },
    missionClaim: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'mc1' }),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { rewardCoins: 0 } })
    }
  };
  const wallet: any = {
    ensureUserWallets: jest.fn().mockResolvedValue(undefined),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'promo-acct', balanceMinor: 1000n }),
    account: jest.fn().mockResolvedValue({ id: 'coin-acct' })
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };
  const fraud: any = { assessCreatorCached: jest.fn().mockResolvedValue({ riskScore: 0 }) };
  return { service: new MissionsService(prisma, wallet, new MoneyService(prisma, ledger, wallet, new MetricsService()), fraud), prisma, wallet, ledger, fraud };
}

describe('mission catalog helpers', () => {
  it('findMission resolves known keys and rejects unknown ones', () => {
    expect(findMission('GIFT_1')?.action).toBe('GIFT');
    expect(findMission('NOPE')).toBeUndefined();
  });

  it('utcDay/utcDayStart bucket a fixed instant correctly', () => {
    const at = new Date('2026-07-02T23:59:59.999Z');
    expect(utcDay(at)).toBe('2026-07-02');
    expect(utcDayStart(at).toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });
});

describe('MissionsService.board', () => {
  it('returns every catalog mission with progress, clamped to target, and claim state', async () => {
    const { service, prisma } = build();
    prisma.roomParticipant.count.mockResolvedValue(7); // over target 3 -> clamped
    prisma.giftTransaction.count.mockResolvedValue(1); // exactly target 1
    prisma.missionClaim.findMany.mockResolvedValue([{ missionKey: 'GIFT_1' }]); // already claimed
    const res = await service.board('u1');
    expect(res.missions).toHaveLength(MISSION_CATALOG.length);
    const watch = res.missions.find((m) => m.key === 'WATCH_3')!;
    expect(watch).toMatchObject({ progress: 3, target: 3, claimable: true, claimed: false });
    const gift = res.missions.find((m) => m.key === 'GIFT_1')!;
    expect(gift).toMatchObject({ progress: 1, claimed: true, claimable: false }); // claimed -> not claimable
    const chat = res.missions.find((m) => m.key === 'CHAT_5')!;
    expect(chat).toMatchObject({ progress: 0, claimable: false });
    const follow = res.missions.find((m) => m.key === 'FOLLOW_1')!;
    expect(follow).toMatchObject({ progress: 0, claimable: false });
  });

  it('windows every progress read to the UTC day start', async () => {
    const { service, prisma } = build();
    await service.board('u1');
    for (const mock of [prisma.roomParticipant.count, prisma.chatMessage.count, prisma.follow.count, prisma.giftTransaction.count]) {
      const where = mock.mock.calls[0][0].where;
      const since = where.joinedAt?.gte ?? where.createdAt?.gte;
      expect(since.toISOString()).toBe(`${utcDay()}T00:00:00.000Z`);
    }
  });
});

describe('MissionsService.claim', () => {
  it('rejects an unknown mission key', async () => {
    const { service } = build();
    await expect(service.claim('u1', 'NOPE')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns alreadyClaimed without re-posting when a claim row exists', async () => {
    const { service, prisma, ledger } = build();
    prisma.missionClaim.findUnique.mockResolvedValue({ rewardCoins: 10 });
    await expect(service.claim('u1', 'GIFT_1')).resolves.toEqual({ ok: true, alreadyClaimed: true, rewardCoins: 10 });
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('rejects an incomplete mission with progress detail', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.count.mockResolvedValue(0);
    await expect(service.claim('u1', 'GIFT_1')).rejects.toThrow('Mission not complete: 0/1');
  });

  it('blocks a high-risk account at the fraud gate (no reward posted)', async () => {
    const { service, prisma, fraud, ledger } = build();
    prisma.giftTransaction.count.mockResolvedValue(1);
    fraud.assessCreatorCached.mockResolvedValue({ riskScore: 0.7 });
    await expect(service.claim('u1', 'GIFT_1')).rejects.toThrow('under review');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('pays a completed mission from PROMO to the user COIN account, idempotently keyed by day', async () => {
    const { service, prisma, wallet, ledger } = build();
    prisma.giftTransaction.count.mockResolvedValue(1);
    const res = await service.claim('u1', 'GIFT_1');
    expect(res).toEqual({ ok: true, alreadyClaimed: false, rewardCoins: 10 });
    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.type).toBe('MISSION_REWARD');
    expect(post.idempotencyKey).toBe(`mission:u1:GIFT_1:${utcDay()}`);
    expect(post.guardNonNegative).toEqual(['promo-acct']); // budget cap: empty promo -> claim fails
    expect(post.entries).toEqual([
      expect.objectContaining({ accountId: 'promo-acct', direction: 'DEBIT', amountMinor: 10 }),
      expect.objectContaining({ accountId: 'coin-acct', direction: 'CREDIT', amountMinor: 10 })
    ]);
    expect(wallet.ensureUserWallets).toHaveBeenCalledWith('u1', 'COIN');
    expect(prisma.missionClaim.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', missionKey: 'GIFT_1', ledgerTransactionId: 'tx1' }) })
    );
  });

  it('a lost claim-row race still reports success (ledger post was idempotent)', async () => {
    const { service, prisma } = build();
    prisma.giftTransaction.count.mockResolvedValue(1);
    prisma.missionClaim.create.mockRejectedValue(new Error('unique violation'));
    await expect(service.claim('u1', 'GIFT_1')).resolves.toEqual({ ok: true, alreadyClaimed: true, rewardCoins: 10 });
  });

  it('honours a configured MISSION_FRAUD_BLOCK threshold', async () => {
    const prev = process.env.MISSION_FRAUD_BLOCK;
    process.env.MISSION_FRAUD_BLOCK = '0.2';
    try {
      const { service, prisma, fraud } = build();
      prisma.giftTransaction.count.mockResolvedValue(1);
      fraud.assessCreatorCached.mockResolvedValue({ riskScore: 0.25 }); // below default, above configured
      await expect(service.claim('u1', 'GIFT_1')).rejects.toThrow('under review');
    } finally {
      if (prev === undefined) delete process.env.MISSION_FRAUD_BLOCK;
      else process.env.MISSION_FRAUD_BLOCK = prev;
    }
  });
});

describe('MissionsService promo funding + status', () => {
  it('funds PROMO by debiting PLATFORM_REVENUE with a non-negative guard (never mints)', async () => {
    const { service, wallet, ledger } = build();
    wallet.ensureSystemAccount
      .mockResolvedValueOnce({ id: 'rev-acct' }) // PLATFORM_REVENUE
      .mockResolvedValueOnce({ id: 'promo-acct' }); // PROMO
    const res = await service.fund('admin1', 500);
    expect(res).toMatchObject({ ok: true, funded: 500 });
    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.type).toBe('PROMO_FUNDING');
    expect(post.guardNonNegative).toEqual(['rev-acct']); // can't fund beyond earned revenue
    expect(post.entries).toEqual([
      expect.objectContaining({ accountId: 'rev-acct', direction: 'DEBIT', amountMinor: 500 }),
      expect.objectContaining({ accountId: 'promo-acct', direction: 'CREDIT', amountMinor: 500 })
    ]);
  });

  it('rejects a non-positive or non-integer funding amount', async () => {
    const { service } = build();
    await expect(service.fund('a', 0)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.fund('a', -5)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.fund('a', 2.5)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('promoStatus reports the materialised promo balance and today’s claims', async () => {
    const { service, prisma } = build();
    prisma.missionClaim.count.mockResolvedValue(3);
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: 25 } });
    const res = await service.promoStatus();
    expect(res).toMatchObject({ promoBalanceCoins: '1000', claimsToday: 3, coinsClaimedToday: 25, day: utcDay() });
  });

  it('promoStatus treats a null claimed sum as zero', async () => {
    const { service, prisma } = build();
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: null } });
    const res = await service.promoStatus();
    expect(res.coinsClaimedToday).toBe(0);
  });
});
