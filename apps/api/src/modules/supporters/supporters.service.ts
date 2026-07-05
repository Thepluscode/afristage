import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { nextTierFor, SUPPORTER_TIERS, tierFor } from './supporter-tiers';

@Injectable()
export class SupportersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agg: AggregationService
  ) {}

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
    const rows = await this.agg.giftTotals({ by: 'viewerId', where: { creatorId: creatorUserId }, limit });
    const members = rows
      .map((r) => ({ viewerId: r.key, totalCoins: r.totalCoins }))
      .filter((r) => r.totalCoins >= SUPPORTER_TIERS[0].minCoins);
    if (!members.length) return { creatorUserId, members: [] };

    const byId = await this.agg.profilesFor(members.map((m) => m.viewerId));
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
