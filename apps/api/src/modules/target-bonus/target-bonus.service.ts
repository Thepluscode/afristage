import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerDirection, LedgerTransactionType, WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { MoneyKey } from '../money/money-keys';
import { MoneyService } from '../money/money.service';
import { WalletService } from '../wallet/wallet.service';
import { TierDto } from './dto/replace-tiers.dto';

// Monthly host target bonus (founder decision 2026-10-26, BIGO teardown R7 §7).
// One ladder for every host; the metric is gift coins RECEIVED in a calendar
// month (UTC); only the highest tier reached pays; an admin pays a closed month
// from PROMO. The bonus is ON TOP of normal gift earnings — nothing already
// credited is ever withheld or taken back.

type Tier = { minGiftCoins: number; bonusCoins: number };
export type Award = { userId: string; giftCoins: number; bonusCoins: number };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// [start, end) of a 'YYYY-MM' month in UTC.
// ponytail: UTC month; per-market local months when a market asks.
export function monthWindow(month: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(month ?? '');
  if (!m) throw new BadRequestException('month must be YYYY-MM');
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(year, index, 1)), end: new Date(Date.UTC(year, index + 1, 1)) };
}

export function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Highest tier whose threshold the coins reach; tiers must be sorted ascending.
export function tierFor<T extends Tier>(giftCoins: number, tiers: T[]): T | null {
  let reached: T | null = null;
  for (const t of tiers) if (giftCoins >= t.minGiftCoins) reached = t;
  return reached;
}

@Injectable()
export class TargetBonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly money: MoneyService,
    private readonly wallet: WalletService,
    private readonly agg: AggregationService
  ) {}

  async listTiers(): Promise<Tier[]> {
    const rows = await this.prisma.targetBonusTier.findMany({ orderBy: { minGiftCoins: 'asc' } });
    return rows.map((r) => ({ minGiftCoins: r.minGiftCoins, bonusCoins: r.bonusCoins }));
  }

  // Replace the whole ladder atomically. An empty list switches the bonus off.
  async replaceTiers(actorId: string, tiers: TierDto[]): Promise<Tier[]> {
    const mins = new Set(tiers.map((t) => t.minGiftCoins));
    if (mins.size !== tiers.length) throw new BadRequestException('Each tier needs a different gift-coin target');
    await this.prisma.$transaction([
      this.prisma.targetBonusTier.deleteMany({}),
      this.prisma.targetBonusTier.createMany({
        data: tiers.map((t) => ({ minGiftCoins: t.minGiftCoins, bonusCoins: t.bonusCoins }))
      })
    ]);
    const saved = await this.listTiers();
    await this.audit(actorId, 'target_bonus.tiers_replaced', 'ladder', { tiers: saved });
    return saved;
  }

  // Admin view of one month: who qualifies (or, once paid, who WAS paid — read
  // back from the ledger, never recomputed) and whether PROMO can cover it.
  async month(month: string) {
    const { end } = monthWindow(month);
    const closed = Date.now() >= end.getTime();
    const paid = await this.paidMonth(month);
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, 'COIN');
    const awards = paid ? paid.awards : await this.qualifying(month);
    return {
      month,
      closed,
      payableFrom: end.toISOString(),
      paid: paid ? { ledgerTransactionId: paid.ledgerTransactionId, paidAt: paid.paidAt } : null,
      tiers: await this.listTiers(),
      awards: await this.withNames(awards),
      totalBonusCoins: awards.reduce((s, a) => s + a.bonusCoins, 0),
      promoBalanceCoins: BigInt(promo.balanceMinor).toString()
    };
  }

  async pay(actorId: string, month: string) {
    const { end } = monthWindow(month);
    if (Date.now() < end.getTime()) {
      throw new BadRequestException(`${month} has not ended yet. Its bonuses can be paid from ${end.toISOString()}.`);
    }
    const already = await this.paidMonth(month);
    if (already) return { ...(await this.month(month)), alreadyPaid: true };

    const tiers = await this.listTiers();
    if (!tiers.length) throw new BadRequestException('No bonus tiers are configured');
    const awards = await this.qualifying(month);
    if (!awards.length) return { ...(await this.month(month)), alreadyPaid: false };

    // Friendly pre-check only; the row-locked PROMO guard in the ledger is the
    // real protection and fails the whole month if this races.
    const total = awards.reduce((s, a) => s + a.bonusCoins, 0);
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, 'COIN');
    if (BigInt(promo.balanceMinor) < BigInt(total)) {
      throw new BadRequestException(
        `The promo budget holds ${BigInt(promo.balanceMinor)} coins but ${month} needs ${total}. Fund the promo budget first.`
      );
    }

    const { transaction, replayed } = await this.money.targetBonus({ month, awards });
    await this.audit(actorId, 'target_bonus.paid', month, {
      ledgerTransactionId: transaction.id,
      hosts: awards.length,
      totalBonusCoins: total,
      replayed
    });
    return { ...(await this.month(month)), alreadyPaid: replayed };
  }

  // The host's own view: this month's progress plus bonuses already paid.
  async me(userId: string) {
    const month = monthOf(new Date());
    const { start, end } = monthWindow(month);
    const [sum, tiers, entries] = await Promise.all([
      this.prisma.giftTransaction.aggregate({
        where: { creatorId: userId, createdAt: { gte: start, lt: end } },
        _sum: { totalCoinAmount: true }
      }),
      this.listTiers(),
      this.prisma.ledgerEntry.findMany({
        where: {
          direction: LedgerDirection.CREDIT,
          account: { userId, accountType: WalletAccountType.EARNING, currency: 'COIN' },
          transaction: { type: LedgerTransactionType.TARGET_BONUS }
        },
        include: { transaction: { select: { metadata: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 12
      })
    ]);
    const giftCoins = sum._sum.totalCoinAmount ?? 0;
    const nextTier = tiers.find((t) => t.minGiftCoins > giftCoins) ?? null;
    return {
      month,
      monthEndsAt: end.toISOString(),
      giftCoins,
      tiers,
      reachedTier: tierFor(giftCoins, tiers),
      nextTier,
      coinsToNextTier: nextTier ? nextTier.minGiftCoins - giftCoins : 0,
      history: entries.map((e) => {
        const meta = (e.transaction.metadata ?? {}) as { month?: string; awards?: Award[] };
        return {
          month: meta.month ?? null,
          bonusCoins: Number(e.amountMinor),
          giftCoins: meta.awards?.find((a) => a.userId === userId)?.giftCoins ?? null,
          paidAt: e.transaction.createdAt.toISOString()
        };
      })
    };
  }

  // Every host whose month total reaches the lowest tier, with the tier they hit.
  // ponytail: one fan-out post for the whole month; batch per host when the
  // qualifying list outgrows a single transaction.
  private async qualifying(month: string): Promise<Award[]> {
    const tiers = await this.listTiers();
    if (!tiers.length) return [];
    const { start, end } = monthWindow(month);
    const rows = await this.prisma.giftTransaction.groupBy({
      by: ['creatorId'],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { totalCoinAmount: true },
      having: { totalCoinAmount: { _sum: { gte: tiers[0].minGiftCoins } } }
    });
    return rows
      .map((r) => {
        const giftCoins = r._sum.totalCoinAmount ?? 0;
        return { userId: r.creatorId, giftCoins, bonusCoins: tierFor(giftCoins, tiers)?.bonusCoins ?? 0 };
      })
      .filter((a) => a.bonusCoins > 0)
      .sort((a, b) => b.giftCoins - a.giftCoins || a.userId.localeCompare(b.userId));
  }

  private async paidMonth(month: string) {
    const tx = await this.prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: MoneyKey.targetBonus(month) } });
    if (!tx) return null;
    const meta = (tx.metadata ?? {}) as { awards?: Award[] };
    return { ledgerTransactionId: tx.id, paidAt: tx.createdAt.toISOString(), awards: meta.awards ?? [] };
  }

  private async withNames(awards: Award[]) {
    const names = await this.agg.profilesFor(awards.map((a) => a.userId));
    return awards.map((a) => {
      const p = names.get(a.userId);
      return { ...a, displayName: p?.displayName ?? p?.username ?? 'Unknown host' };
    });
  }

  private audit(actorId: string, action: string, target: string, metadata: Record<string, any>) {
    return this.prisma.adminAuditLog.create({ data: { actorId, action, target, metadata } });
  }
}
