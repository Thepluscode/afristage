import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

// R5 §9 #5: ONE aggregation engine over settled gift/mission activity.
// Every counting feature (charts, event leaderboards, supporter tiers, circle
// points, top gifters, dashboards) is the same read — "sum coins grouped by a
// key, inside a window, top N, with display names" — implemented once here.
// Gifts are non-reversible in the current model, so every row is settled.
//
// ponytail: computed on demand. When chart traffic grows, materialise these
// per (scope, window) on a short interval behind this same interface.

export type GiftGroupKey = 'viewerId' | 'creatorId' | 'roomId';

export interface GiftTotalsOptions {
  by: GiftGroupKey;
  where?: Prisma.GiftTransactionWhereInput; // scope: creatorId/roomId/eventId/members…
  since?: Date;
  until?: Date;
  limit?: number; // clamped 1..100; defaults to 20
  sumQuantity?: boolean; // also sum gift quantity (top-gifters wants it)
}

export interface GiftTotalRow {
  key: string;
  totalCoins: number;
  quantity: number;
  txCount: number;
}

// Resolve an API-level window name to its lower bound. 'day' = start of today
// (UTC-local server day, matching the daily chart), 'week' = rolling 7 days,
// anything else ('all') = no bound.
export function windowSince(window: string | undefined): Date | undefined {
  if (window === 'day') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (window === 'week') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return undefined;
}

@Injectable()
export class AggregationService {
  constructor(private readonly prisma: PrismaService) {}

  // The core primitive: coins grouped by a key, windowed, ranked, bounded.
  // Order is deterministic: coins desc, then key asc as a tie-break.
  async giftTotals(opts: GiftTotalsOptions): Promise<GiftTotalRow[]> {
    const take = Math.min(Math.max(Math.trunc(opts.limit ?? 20) || 20, 1), 100);
    const createdAt =
      opts.since || opts.until ? { ...(opts.since ? { gte: opts.since } : {}), ...(opts.until ? { lte: opts.until } : {}) } : undefined;
    const rows = await this.prisma.giftTransaction.groupBy({
      by: [opts.by],
      where: { ...(opts.where ?? {}), ...(createdAt ? { createdAt } : {}) },
      _sum: { totalCoinAmount: true, ...(opts.sumQuantity ? { quantity: true } : {}) },
      _count: true,
      orderBy: [{ _sum: { totalCoinAmount: 'desc' } }, { [opts.by]: 'asc' }],
      take
    } as any);
    return rows.map((r: any) => ({
      key: r[opts.by] as string,
      totalCoins: r._sum.totalCoinAmount ?? 0,
      quantity: r._sum.quantity ?? 0,
      txCount: r._count ?? 0
    }));
  }

  // Plain sum (no grouping) — circle pools, budget checks.
  async sumGiftCoins(where: Prisma.GiftTransactionWhereInput, since?: Date): Promise<number> {
    const agg = await this.prisma.giftTransaction.aggregate({
      where: { ...where, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { totalCoinAmount: true }
    });
    return agg._sum.totalCoinAmount ?? 0;
  }

  // Mission rewards are the other settled coin source features count.
  async sumMissionCoins(userIds: string[], since?: Date): Promise<number> {
    if (!userIds.length) return 0;
    const agg = await this.prisma.missionClaim.aggregate({
      where: { userId: { in: userIds }, ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { rewardCoins: true }
    });
    return agg._sum.rewardCoins ?? 0;
  }

  // Safe public profile fields for enrichment. Fallback POLICY (Anonymous vs
  // Supporter vs stageName-first) stays at the call site — only the lookup is
  // shared.
  async profilesFor(userIds: string[]) {
    if (!userIds.length) return new Map<string, { displayName: string | null; username: string | null; avatarUrl: string | null }>();
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, displayName: true, username: true, avatarUrl: true }
    });
    return new Map(profiles.map((p) => [p.userId, { displayName: p.displayName, username: p.username, avatarUrl: p.avatarUrl }]));
  }
}
