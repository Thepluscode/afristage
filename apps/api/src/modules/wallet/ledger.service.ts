import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionStatus, LedgerTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type LedgerEntryInput = {
  accountId: string;
  direction: LedgerDirection;
  amountMinor: bigint | number;
  currency: string;
};

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async postTransaction(input: {
    type: LedgerTransactionType;
    idempotencyKey: string;
    externalReference?: string;
    metadata?: Record<string, any>;
    entries: LedgerEntryInput[];
    // Account ids whose balance must not go negative after this post. Each is
    // row-locked inside the transaction so the check + debit are atomic — this
    // closes the read-then-write overdraw race (concurrent gifts/payouts with
    // distinct idempotency keys could otherwise both pass an out-of-transaction
    // balance check and drive the account negative, minting spendable value).
    guardNonNegative?: string[];
  }) {
    const existing = await this.prisma.ledgerTransaction.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { entries: true }
    });
    if (existing) return existing;

    if (input.entries.length < 2) throw new BadRequestException('Ledger transaction needs at least two entries');
    const currencies = new Set(input.entries.map((entry) => entry.currency));
    if (currencies.size !== 1) throw new BadRequestException('Mixed-currency ledger transaction not allowed');

    const debits = input.entries
      .filter((entry) => entry.direction === LedgerDirection.DEBIT)
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);
    const credits = input.entries
      .filter((entry) => entry.direction === LedgerDirection.CREDIT)
      .reduce((sum, entry) => sum + BigInt(entry.amountMinor), 0n);

    if (debits !== credits) throw new BadRequestException('Ledger transaction is unbalanced');

    // Net delta this post applies to each touched account. Guarded accounts
    // with no entry still get a 0 delta so their balance is checked (preserves
    // the pre-materialisation guard semantics).
    const deltas = new Map<string, bigint>();
    for (const entry of input.entries) {
      const signed = entry.direction === LedgerDirection.CREDIT ? BigInt(entry.amountMinor) : -BigInt(entry.amountMinor);
      deltas.set(entry.accountId, (deltas.get(entry.accountId) ?? 0n) + signed);
    }
    const guarded = new Set(input.guardNonNegative ?? []);
    for (const accountId of guarded) {
      if (!deltas.has(accountId)) deltas.set(accountId, 0n);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // O(1) balance maintenance: the atomic increment takes the account's row
        // lock, so concurrent posts on the same account serialize here — the same
        // guarantee the old FOR-UPDATE + full entry re-sum gave, without scanning
        // every historical entry on the hot gifting path (R5 §9 item 1). A
        // guarded account that would go negative aborts the whole transaction,
        // rolling the increments back.
        for (const [accountId, delta] of deltas) {
          const updated = await tx.walletAccount.update({
            where: { id: accountId },
            data: { balanceMinor: { increment: delta } }
          });
          if (guarded.has(accountId) && updated.balanceMinor < 0n) {
            throw new BadRequestException('Insufficient balance');
          }
        }

        const transaction = await tx.ledgerTransaction.create({
          data: {
            type: input.type,
            status: LedgerTransactionStatus.POSTED,
            idempotencyKey: input.idempotencyKey,
            externalReference: input.externalReference,
            metadata: input.metadata || {}
          }
        });

        await tx.ledgerEntry.createMany({
          data: input.entries.map((entry) => ({
            transactionId: transaction.id,
            accountId: entry.accountId,
            direction: entry.direction,
            amountMinor: BigInt(entry.amountMinor),
            currency: entry.currency
          }))
        });

        return tx.ledgerTransaction.findUniqueOrThrow({ where: { id: transaction.id }, include: { entries: true } });
      });
    } catch (err) {
      // Idempotency race: a concurrent poster (e.g. the Stripe webhook + the
      // client's pull-verify crediting the same intent) inserted the row between
      // our findUnique probe and this unique-constrained insert. The $transaction
      // rolled our duplicate back — no double-post — so return the winner's row as
      // a clean replay instead of surfacing a raw 500 the caller can't act on.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.ledgerTransaction.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { entries: true }
        });
        if (winner) return winner;
      }
      throw err;
    }
  }
}
