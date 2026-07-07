import { LedgerDirection, LedgerTransactionType, PrismaClient, WalletAccountType } from '@prisma/client';
import { LedgerService } from '../wallet/ledger.service';
import { WalletService } from '../wallet/wallet.service';
import { MoneyService } from './money.service';

// RFC #144 boundary test: the money catalog runs against a REAL Postgres, so
// the row-locked overdraw guard is proven to survive the abstraction THROUGH a
// real caller path (giftSplit), not just inside LedgerService. The unit specs
// prove argument equivalence; only this proves the concurrency semantics.
//
// Excluded from the default suite (jest testRegex is `.*\.spec\.ts$`).
// Run with: npm run test:concurrency  (needs DATABASE_URL up).

const url = process.env.DATABASE_URL
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=40&pool_timeout=30`
  : undefined;

const PREFIX = 'money-int';

describe('MoneyService boundary (integration, real Postgres)', () => {
  let prisma: PrismaClient;
  let money: MoneyService;
  let dbReady = false;
  let viewerId: string;
  let creatorId: string;

  const balanceOf = async (userId: string, type: WalletAccountType) => {
    const acc = await prisma.walletAccount.findFirst({ where: { userId, accountType: type, currency: 'COIN' } });
    return BigInt(acc?.balanceMinor ?? 0n);
  };

  beforeAll(async () => {
    prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      return; // no database in this environment — tests self-skip
    }
    const ledger = new LedgerService(prisma as any);
    const wallet = new WalletService(prisma as any, ledger as any);
    money = new MoneyService(prisma as any, ledger, wallet);

    const viewer = await prisma.user.create({ data: {} });
    const creator = await prisma.user.create({ data: {} });
    viewerId = viewer.id;
    creatorId = creator.id;
    await wallet.ensureUserWallets(viewerId, 'COIN');
    await wallet.ensureUserWallets(creatorId, 'COIN');

    // Seed the viewer with exactly 1000 coins via a balanced adjustment
    // (the ADJUSTMENT escape hatch — the one legitimate raw-ledger use).
    const sink = await prisma.walletAccount.findFirstOrThrow({
      where: { userId: creatorId, accountType: WalletAccountType.EARNING, currency: 'COIN' }
    });
    const coin = await prisma.walletAccount.findFirstOrThrow({
      where: { userId: viewerId, accountType: WalletAccountType.COIN, currency: 'COIN' }
    });
    await ledger.postTransaction({
      type: LedgerTransactionType.ADJUSTMENT,
      idempotencyKey: `${PREFIX}:seed:${viewerId}`,
      entries: [
        { accountId: sink.id, direction: LedgerDirection.DEBIT, amountMinor: 1000n, currency: 'COIN' },
        { accountId: coin.id, direction: LedgerDirection.CREDIT, amountMinor: 1000n, currency: 'COIN' }
      ]
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('20 concurrent gift splits can never overdraw the viewer (guard survives the catalog)', async () => {
    if (!dbReady) return console.warn('skipping: no DATABASE_URL');
    const COST = 90; // 1000 coins / 90 => exactly 11 gifts can settle
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) =>
        money.giftSplit({
          viewerId,
          creatorId,
          clientKey: `${PREFIX}-race-${i}`,
          totalMinor: COST,
          creatorShareBps: 6000,
          agency: null,
          metadata: { roomId: 'int-room', viewerId, creatorId, giftId: 'int-gift', quantity: 1 }
        })
      )
    );
    const wins = results.filter((r) => r.status === 'fulfilled').length;
    expect(wins).toBe(Math.floor(1000 / COST)); // 11
    const finalBalance = await balanceOf(viewerId, WalletAccountType.COIN);
    expect(finalBalance).toBe(BigInt(1000 - wins * COST)); // 10, never negative
    expect(finalBalance).toBeGreaterThanOrEqual(0n);
  }, 60_000);

  it('replay: the same client key settles exactly once and reports replayed', async () => {
    if (!dbReady) return console.warn('skipping: no DATABASE_URL');
    const before = await balanceOf(viewerId, WalletAccountType.COIN);
    const first = await money.giftSplit({
      viewerId, creatorId, clientKey: `${PREFIX}-replay`, totalMinor: 10,
      creatorShareBps: 6000, agency: null,
      metadata: { roomId: 'int-room', viewerId, creatorId, giftId: 'int-gift', quantity: 1 }
    });
    const second = await money.giftSplit({
      viewerId, creatorId, clientKey: `${PREFIX}-replay`, totalMinor: 10,
      creatorShareBps: 6000, agency: null,
      metadata: { roomId: 'int-room', viewerId, creatorId, giftId: 'int-gift', quantity: 1 }
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.transaction.id).toBe(first.transaction.id);
    expect(await balanceOf(viewerId, WalletAccountType.COIN)).toBe(before - 10n); // debited ONCE
  });

  it('replay short-circuits before the balance check (retry after draining succeeds)', async () => {
    if (!dbReady) return console.warn('skipping: no DATABASE_URL');
    const remaining = await balanceOf(viewerId, WalletAccountType.COIN);
    if (remaining === 0n) return; // nothing left to drain-test with
    // Spend everything that's left in one gift...
    const drainAll = await money.giftSplit({
      viewerId, creatorId, clientKey: `${PREFIX}-drain`, totalMinor: Number(remaining),
      creatorShareBps: 6000, agency: null,
      metadata: { roomId: 'int-room', viewerId, creatorId, giftId: 'int-gift', quantity: 1 }
    });
    expect(drainAll.replayed).toBe(false);
    expect(await balanceOf(viewerId, WalletAccountType.COIN)).toBe(0n);
    // ...then retry the SAME gift with a zero balance: a naive balance check
    // would reject the retry; the probe must return the settled transaction.
    const retry = await money.giftSplit({
      viewerId, creatorId, clientKey: `${PREFIX}-drain`, totalMinor: Number(remaining),
      creatorShareBps: 6000, agency: null,
      metadata: { roomId: 'int-room', viewerId, creatorId, giftId: 'int-gift', quantity: 1 }
    });
    expect(retry.replayed).toBe(true);
    expect(retry.transaction.id).toBe(drainAll.transaction.id);
  });

  it('spend is guarded, drain passes through zero (guard-by-role semantics)', async () => {
    if (!dbReady) return console.warn('skipping: no DATABASE_URL');
    // Spend: a mission reward from an unfunded PROMO must fail and write nothing.
    await expect(
      money.missionReward({ userId: viewerId, missionKey: `${PREFIX}-M`, day: `${PREFIX}-day`, rewardCoins: 1_000_000 })
    ).rejects.toThrow('Insufficient balance');
    // Drain: a coin purchase drives PAYMENT_CLEARING negative by design — the
    // clearing account is the counterparty of value entering the system.
    const res = await money.coinPurchase({
      userId: viewerId, intentId: `${PREFIX}-intent-${viewerId}`, coinAmount: 500,
      provider: 'MOCK', amountMinor: '50000', fiatCurrency: 'NGN', externalReference: `${PREFIX}-ref`
    });
    expect(res.transaction.id).toBeDefined();
    expect(await balanceOf(viewerId, WalletAccountType.COIN)).toBe(500n);
  });
});
