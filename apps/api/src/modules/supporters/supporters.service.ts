import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { nextTierFor, SUPPORTER_TIERS, tierFor } from './supporter-tiers';

@Injectable()
export class SupportersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCreator(creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: creatorUserId } });
    if (!creator) throw new NotFoundException('Creator not found');
    return creator;
  }

  // The caller's standing with one creator: cumulative coins, current tier,
  // and how far to the next. Pure aggregate over the (creatorId, viewerId) index.
  async myStanding(creatorUserId: string, viewerId: string) {
    await this.assertCreator(creatorUserId);
    const agg = await this.prisma.giftTransaction.aggregate({
      where: { creatorId: creatorUserId, viewerId },
      _sum: { totalCoinAmount: true }
    });
    const totalCoins = agg._sum.totalCoinAmount ?? 0;
    const tier = tierFor(totalCoins);
    const next = nextTierFor(totalCoins);
    return {
      creatorUserId,
      totalCoins,
      tier: tier ? { key: tier.key, label: tier.label } : null,
      nextTier: next ? { key: next.key, label: next.label, coinsToGo: next.minCoins - totalCoins } : null
    };
  }

  // The creator's Supporter Circle: everyone who has reached at least the
  // lowest tier, ranked by cumulative coins, with display-name fallbacks.
  async circle(creatorUserId: string, limit = 20) {
    await this.assertCreator(creatorUserId);
    const take = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100); // bounded 1..100
    const rows = await this.prisma.giftTransaction.groupBy({
      by: ['viewerId'],
      where: { creatorId: creatorUserId },
      _sum: { totalCoinAmount: true },
      orderBy: { _sum: { totalCoinAmount: 'desc' } },
      take
    });
    const members = rows
      .map((r) => ({ viewerId: r.viewerId, totalCoins: r._sum.totalCoinAmount ?? 0 }))
      .filter((r) => r.totalCoins >= SUPPORTER_TIERS[0].minCoins);
    if (!members.length) return { creatorUserId, members: [] };

    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: members.map((m) => m.viewerId) } },
      select: { userId: true, displayName: true, username: true }
    });
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return {
      creatorUserId,
      members: members.map((m, i) => {
        const tier = tierFor(m.totalCoins)!; // filtered to >= lowest threshold above
        return {
          rank: i + 1,
          userId: m.viewerId,
          displayName: byId.get(m.viewerId)?.displayName ?? byId.get(m.viewerId)?.username ?? 'Anonymous',
          totalCoins: m.totalCoins,
          tier: { key: tier.key, label: tier.label }
        };
      })
    };
  }
}
