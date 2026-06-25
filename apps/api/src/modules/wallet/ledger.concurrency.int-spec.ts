import { PrismaClient, LedgerDirection, LedgerTransactionType, WalletAccountType } from '@prisma/client';
import { LedgerService } from './ledger.service';

// Integration test: proves the guardNonNegative row lock actually serializes
// concurrent posts against a REAL Postgres, so overdraw is impossible under load.
// The unit spec only exercises the in-transaction balance math (the FOR UPDATE is
// a no-op against the mock); the race protection itself can only be verified here.
//
// Excluded from the default suite (jest testRegex is `.*\.spec\.ts$`; this file is
// `.int-spec.ts`). Run with: npm run test:concurrency  (needs DATABASE_URL up).

// Raise the connection limit so all concurrent interactive transactions can grab
// a pooled connection and contend on the lock, rather than starving the pool.
const url = process.env.DATABASE_URL
  ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=40&pool_timeout=30`
  : undefined;

const PREFIX = 'ovd-test';
const sum = (entries: { direction: LedgerDirection; amountMinor: bigint }[]) =>
  entries.reduce((s, e) => (e.direction === LedgerDirection.CREDIT ? s + BigInt(e.amountMinor) : s - BigInt(e.amountMinor)), 0n);

describe('LedgerService overdraw protection under concurrency (integration)', () => {
  let prisma: PrismaClient;
  let ledger: LedgerService;
  let dbReady = false;
  let userId: string;
  let coinId: string; // viewer COIN account (the guarded, debited account)
  let sinkId: string; // a sink account to keep each gift transaction balanced

  beforeAll(async () => {
    prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      dbReady = true;
    } catch {
      // No database in this environment — the test self-skips (see guard below).
      return;
    }
    ledger = new LedgerService(prisma as any);

    const user = await prisma.user.create({ data: {} });
    userId = user.id;
    const coin = await prisma.walletAccount.create({ data: { userId, accountType: WalletAccountType.COIN, currency: 'COIN' } });
    const sink = await prisma.walletAccount.create({ data: { userId, accountType: WalletAccountType.EARNING, currency: 'COIN' } });
    coinId = coin.id;
    sinkId = sink.id;

    // Seed the viewer with exactly 1000 coins (one balanced credit).
    await ledger.postTransaction({
      type: LedgerTransactionType.ADJUSTMENT,
      idempotencyKey: `${PREFIX}:seed`,
      entries: [
        { accountId: sinkId, direction: LedgerDirection.DEBIT, amountMinor: 1000n, currency: 'COIN' },
        { accountId: coinId, direction: LedgerDirection.CREDIT, amountMinor: 1000n, currency: 'COIN' }
      ]
    });
  });

  afterAll(async () => {
    if (dbReady) {
      const accountIds = [coinId, sinkId];
      await prisma.ledgerEntry.deleteMany({ where: { accountId: { in: accountIds } } });
      await prisma.ledgerTransaction.deleteMany({ where: { idempotencyKey: { startsWith: PREFIX } } });
      await prisma.walletAccount.deleteMany({ where: { id: { in: accountIds } } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma?.$disconnect();
  });

  it('lets exactly floor(balance/cost) of N concurrent debits win; balance never goes negative', async () => {
    if (!dbReady) {
      // eslint-disable-next-line no-console
      console.warn('SKIP: no DATABASE_URL reachable for the concurrency integration test');
      return;
    }

    const COST = 100n;
    const N = 20; // 20 concurrent gifts of 100 against a 1000 balance -> 10 may win

    const attempts = Array.from({ length: N }, (_, i) =>
      ledger
        .postTransaction({
          type: LedgerTransactionType.GIFT,
          idempotencyKey: `${PREFIX}:gift:${i}`, // distinct keys — idempotency does NOT protect this
          guardNonNegative: [coinId],
          entries: [
            { accountId: coinId, direction: LedgerDirection.DEBIT, amountMinor: COST, currency: 'COIN' },
            { accountId: sinkId, direction: LedgerDirection.CREDIT, amountMinor: COST, currency: 'COIN' }
          ]
        })
        .then(() => 'ok' as const)
        .catch(() => 'rejected' as const)
    );

    const results = await Promise.all(attempts);
    const wins = results.filter((r) => r === 'ok').length;
    const rejects = results.filter((r) => r === 'rejected').length;

    // Authoritative balance straight from the ledger.
    const entries = await prisma.ledgerEntry.findMany({ where: { accountId: coinId }, select: { direction: true, amountMinor: true } });
    const finalBalance = sum(entries);

    expect(wins).toBe(10); // exactly balance/cost succeeded — no more, no fewer
    expect(rejects).toBe(N - 10);
    expect(finalBalance).toBe(0n); // drained to zero, never overdrawn
    expect(finalBalance >= 0n).toBe(true);
  }, 60000);
});
