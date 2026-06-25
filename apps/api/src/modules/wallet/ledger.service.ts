import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionStatus, LedgerTransactionType } from '@prisma/client';
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

    return this.prisma.$transaction(async (tx) => {
      // Lock each guarded account row FOR UPDATE so concurrent posts on it
      // serialize, then recompute its balance INSIDE the transaction (seeing
      // any already-committed debit) and reject if this post would overdraw it.
      for (const accountId of input.guardNonNegative ?? []) {
        await tx.$queryRaw`SELECT id FROM wallet_accounts WHERE id = ${accountId} FOR UPDATE`;
        const entries = await tx.ledgerEntry.findMany({ where: { accountId } });
        let balance = entries.reduce(
          (sum, entry) =>
            entry.direction === LedgerDirection.CREDIT ? sum + BigInt(entry.amountMinor) : sum - BigInt(entry.amountMinor),
          0n
        );
        for (const entry of input.entries.filter((entry) => entry.accountId === accountId)) {
          balance += entry.direction === LedgerDirection.CREDIT ? BigInt(entry.amountMinor) : -BigInt(entry.amountMinor);
        }
        if (balance < 0n) throw new BadRequestException('Insufficient balance');
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
  }
}
