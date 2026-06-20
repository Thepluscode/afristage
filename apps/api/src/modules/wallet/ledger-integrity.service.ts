import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LedgerDirection } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type IntegrityResult = {
  ok: boolean;
  checkedAt: string;
  currencies: { currency: string; debits: string; credits: string; balanced: boolean }[];
  unbalancedTransactions: number;
  imbalancedTransactions: { id: string; debit: string; credit: string }[];
};

// Double-entry safety net: the whole ledger must net to zero per currency and
// every single transaction must balance. If this ever fails, money is wrong —
// surface it loudly (CRITICAL log) rather than letting it rot silently.
@Injectable()
export class LedgerIntegrityService {
  private readonly logger = new Logger(LedgerIntegrityService.name);
  private lastResult: IntegrityResult | null = null;

  constructor(private readonly prisma: PrismaService) {}

  getLast(): IntegrityResult | null {
    return this.lastResult;
  }

  async check(): Promise<IntegrityResult> {
    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['currency', 'direction'],
      _sum: { amountMinor: true }
    });

    const byCurrency = new Map<string, { debits: bigint; credits: bigint }>();
    for (const row of grouped) {
      const acc = byCurrency.get(row.currency) ?? { debits: 0n, credits: 0n };
      const sum = BigInt(row._sum.amountMinor ?? 0);
      if (row.direction === LedgerDirection.DEBIT) acc.debits += sum;
      else acc.credits += sum;
      byCurrency.set(row.currency, acc);
    }

    const currencies = [...byCurrency.entries()].map(([currency, v]) => ({
      currency,
      debits: v.debits.toString(),
      credits: v.credits.toString(),
      balanced: v.debits === v.credits
    }));

    const rows = await this.prisma.$queryRaw<{ transaction_id: string; debit: bigint; credit: bigint }[]>`
      SELECT transaction_id,
        SUM(CASE WHEN direction = 'DEBIT' THEN amount_minor ELSE 0 END) AS debit,
        SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE 0 END) AS credit
      FROM ledger_entries
      GROUP BY transaction_id
      HAVING SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor ELSE -amount_minor END) <> 0`;
    const imbalancedTransactions = rows.map((r) => ({ id: r.transaction_id, debit: r.debit.toString(), credit: r.credit.toString() }));
    const unbalancedTransactions = imbalancedTransactions.length;

    const ok = currencies.every((c) => c.balanced) && unbalancedTransactions === 0;
    const result: IntegrityResult = { ok, checkedAt: new Date().toISOString(), currencies, unbalancedTransactions, imbalancedTransactions };
    this.lastResult = result;

    if (ok) {
      this.logger.log(`Ledger integrity OK: ${currencies.map((c) => `${c.currency}=${c.credits}`).join(', ') || 'no entries'}`);
    } else {
      this.logger.error(`LEDGER INTEGRITY FAILURE: ${JSON.stringify(result)}`);
    }
    return result;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduledCheck() {
    await this.check();
  }
}
