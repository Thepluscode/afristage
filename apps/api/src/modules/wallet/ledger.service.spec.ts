import { BadRequestException } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';

// ponytail: hand-rolled Prisma stub, no test framework mocking lib needed.
// Balances are materialised on the account row; the stub applies the same
// atomic increments the service issues (prod serializes them via the row lock).
function makePrisma(startingBalances: Record<string, bigint> = {}) {
  const created: any = { entries: [] };
  const balances: Record<string, bigint> = { ...startingBalances };
  return {
    calls: created,
    balances,
    ledgerTransaction: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 'tx-1', ...data }),
      findUniqueOrThrow: async () => ({ id: 'tx-1', entries: created.entries })
    },
    ledgerEntry: {
      createMany: async ({ data }: any) => {
        created.entries = data;
        return { count: data.length };
      }
    },
    $transaction: async (fn: any) => fn({
      walletAccount: {
        update: async ({ where, data }: any) => {
          balances[where.id] = (balances[where.id] ?? 0n) + BigInt(data.balanceMinor.increment);
          return { id: where.id, balanceMinor: balances[where.id] };
        }
      },
      ledgerTransaction: {
        create: async ({ data }: any) => ({ id: 'tx-1', ...data }),
        findUniqueOrThrow: async () => ({ id: 'tx-1', entries: created.entries })
      },
      ledgerEntry: {
        createMany: async ({ data }: any) => {
          created.entries = data;
          return { count: data.length };
        }
      }
    })
  };
}

const NGN = 'NGN';
const balancedEntries = [
  { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: NGN },
  { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 60n, currency: NGN },
  { accountId: 'c', direction: LedgerDirection.CREDIT, amountMinor: 40n, currency: NGN }
];

describe('LedgerService.postTransaction', () => {
  it('posts a balanced double-entry transaction', async () => {
    const prisma = makePrisma();
    const service = new LedgerService(prisma as any);
    const tx = await service.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey: 'k1',
      entries: balancedEntries
    });
    expect(tx.entries).toHaveLength(3);
    const debits = tx.entries
      .filter((e: any) => e.direction === LedgerDirection.DEBIT)
      .reduce((s: bigint, e: any) => s + BigInt(e.amountMinor), 0n);
    const credits = tx.entries
      .filter((e: any) => e.direction === LedgerDirection.CREDIT)
      .reduce((s: bigint, e: any) => s + BigInt(e.amountMinor), 0n);
    expect(debits).toBe(credits);
  });

  it('rejects an unbalanced transaction', async () => {
    const prisma = makePrisma();
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({
        type: LedgerTransactionType.GIFT,
        idempotencyKey: 'k2',
        entries: [
          { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: NGN },
          { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 90n, currency: NGN }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a mixed-currency transaction', async () => {
    const prisma = makePrisma();
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({
        type: LedgerTransactionType.GIFT,
        idempotencyKey: 'k3',
        entries: [
          { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: 'NGN' },
          { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 100n, currency: 'USD' }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fewer than two entries', async () => {
    const prisma = makePrisma();
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({
        type: LedgerTransactionType.GIFT,
        idempotencyKey: 'k4',
        entries: [{ accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: NGN }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a guarded debit that would overdraw the account', async () => {
    // Account 'a' holds 50. A 100-coin debit guarded on 'a' would take it to
    // -50, so the post must be rejected inside the transaction (rollback).
    const prisma = makePrisma({ a: 50n });
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({
        type: LedgerTransactionType.GIFT,
        idempotencyKey: 'overdraw',
        guardNonNegative: ['a'],
        entries: [
          { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: 'COIN' },
          { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 100n, currency: 'COIN' }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a guarded debit fully covered by the balance', async () => {
    const prisma = makePrisma({ a: 100n });
    const service = new LedgerService(prisma as any);
    const tx = await service.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey: 'covered',
      guardNonNegative: ['a'],
      entries: [
        { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: 'COIN' },
        { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 100n, currency: 'COIN' }
      ]
    });
    expect(tx.entries).toHaveLength(2);
  });

  it('is idempotent: returns the existing transaction without re-posting', async () => {
    const prisma = makePrisma();
    const existing = { id: 'tx-existing', entries: [] };
    prisma.ledgerTransaction.findUnique = async () => existing as any;
    const service = new LedgerService(prisma as any);
    const tx = await service.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey: 'dup',
      entries: balancedEntries
    });
    expect(tx).toBe(existing);
  });
});

describe('LedgerService idempotency-race collision (concurrent poster)', () => {
  const p2002 = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

  // Probe returns null (we think we're first), the insert then loses the race and
  // throws P2002; the catch re-fetches the winner and returns it as a replay.
  it('returns the winner row (replay) when the unique insert loses the race', async () => {
    const prisma = makePrisma();
    const winner = { id: 'tx-winner', entries: [] };
    let probes = 0;
    prisma.ledgerTransaction.findUnique = async () => (probes++ === 0 ? null : (winner as any));
    prisma.$transaction = async () => {
      throw p2002();
    };
    const service = new LedgerService(prisma as any);
    const tx = await service.postTransaction({
      type: LedgerTransactionType.COIN_PURCHASE,
      idempotencyKey: 'raced',
      entries: balancedEntries
    });
    expect(tx).toBe(winner);
  });

  it('rethrows a P2002 whose winner cannot be found (should not happen, but no silent success)', async () => {
    const prisma = makePrisma();
    prisma.ledgerTransaction.findUnique = async () => null; // never resolves to a winner
    prisma.$transaction = async () => {
      throw p2002();
    };
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({ type: LedgerTransactionType.COIN_PURCHASE, idempotencyKey: 'raced-lost', entries: balancedEntries })
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('rethrows any non-P2002 error unchanged (real DB failure is not a replay)', async () => {
    const prisma = makePrisma();
    prisma.$transaction = async () => {
      throw new Error('connection reset');
    };
    const service = new LedgerService(prisma as any);
    await expect(
      service.postTransaction({ type: LedgerTransactionType.COIN_PURCHASE, idempotencyKey: 'db-down', entries: balancedEntries })
    ).rejects.toThrow('connection reset');
  });
});

describe('LedgerService guarded-account direction arms', () => {
  it('nets both credit and debit entries on a guarded account into one delta', async () => {
    const prisma = makePrisma({ g: 80n });
    const svc = new LedgerService(prisma as any);
    const res = await svc.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey: 'k-dirs',
      guardNonNegative: ['g'],
      entries: [
        { accountId: 'g', direction: LedgerDirection.CREDIT, amountMinor: 50n, currency: NGN },
        { accountId: 'g', direction: LedgerDirection.DEBIT, amountMinor: 50n, currency: NGN }
      ]
    });
    expect(res).toBeDefined();
    expect(prisma.balances.g).toBe(80n); // 80 + 50 - 50
  });
});

describe('LedgerService materialised balances', () => {
  it('applies the net delta of every touched account, guarded or not', async () => {
    const prisma = makePrisma({ a: 200n });
    const svc = new LedgerService(prisma as any);
    await svc.postTransaction({
      type: LedgerTransactionType.GIFT,
      idempotencyKey: 'k-mat',
      guardNonNegative: ['a'],
      entries: balancedEntries // a -100, b +60, c +40
    });
    expect(prisma.balances).toEqual({ a: 100n, b: 60n, c: 40n });
  });

  it('lets an unguarded account go negative (clearing accounts)', async () => {
    const prisma = makePrisma(); // all start at 0
    const svc = new LedgerService(prisma as any);
    await svc.postTransaction({
      type: LedgerTransactionType.COIN_PURCHASE,
      idempotencyKey: 'k-clearing',
      entries: [
        { accountId: 'clearing', direction: LedgerDirection.DEBIT, amountMinor: 100n, currency: NGN },
        { accountId: 'coin', direction: LedgerDirection.CREDIT, amountMinor: 100n, currency: NGN }
      ]
    });
    expect(prisma.balances.clearing).toBe(-100n); // allowed: not guarded
    expect(prisma.balances.coin).toBe(100n);
  });

  it('still checks a guarded account that has no entry in this post (zero delta)', async () => {
    // Drifted-negative guarded account with no entries in the post: the 0-delta
    // check preserves the old "guarded means checked" semantics.
    const prisma = makePrisma({ z: -1n, a: 100n });
    const svc = new LedgerService(prisma as any);
    await expect(
      svc.postTransaction({
        type: LedgerTransactionType.GIFT,
        idempotencyKey: 'k-zero-delta',
        guardNonNegative: ['z'],
        entries: [
          { accountId: 'a', direction: LedgerDirection.DEBIT, amountMinor: 10n, currency: NGN },
          { accountId: 'b', direction: LedgerDirection.CREDIT, amountMinor: 10n, currency: NGN }
        ]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
