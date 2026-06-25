import { BadRequestException } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType } from '@prisma/client';
import { LedgerService } from './ledger.service';

// ponytail: hand-rolled Prisma stub, no test framework mocking lib needed.
function makePrisma(existingByAccount: Record<string, any[]> = {}) {
  const created: any = { entries: [] };
  return {
    calls: created,
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
      // FOR UPDATE lock — a no-op in the stub; the guard's correctness is in the
      // balance recomputation below, which the row lock serializes in prod.
      $queryRaw: async () => [],
      ledgerTransaction: {
        create: async ({ data }: any) => ({ id: 'tx-1', ...data }),
        findUniqueOrThrow: async () => ({ id: 'tx-1', entries: created.entries })
      },
      ledgerEntry: {
        findMany: async ({ where }: any) => existingByAccount[where.accountId] ?? [],
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
    // Account 'a' holds 50 (one 50-coin credit). A 100-coin debit guarded on 'a'
    // would take it to -50, so the post must be rejected inside the transaction.
    const prisma = makePrisma({
      a: [{ accountId: 'a', direction: LedgerDirection.CREDIT, amountMinor: 50n, currency: 'COIN' }]
    });
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
    const prisma = makePrisma({
      a: [{ accountId: 'a', direction: LedgerDirection.CREDIT, amountMinor: 100n, currency: 'COIN' }]
    });
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
