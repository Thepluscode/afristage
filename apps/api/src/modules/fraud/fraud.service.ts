import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { evaluateFraudSignals, evaluateGroupFraudSignals, FraudFeatures, GroupFraudFeatures, GROUP_FRAUD_THRESHOLDS } from './fraud-signals';

const DAY_MS = 86_400_000;
const BASELINE_DAYS = 7;

@Injectable()
export class FraudService {
  constructor(private readonly prisma: PrismaService) {}

  // Gather the data each fraud rule needs for a creator, then run the explainable
  // evaluator. Read-only — produces an assessment for a human reviewer; it does
  // not itself move money.
  async assessCreator(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, createdAt: true } });
    if (!user) throw new NotFoundException('User not found');

    const now = Date.now();
    const accountAgeDays = (now - user.createdAt.getTime()) / DAY_MS;

    // Income by supporter (who gifted this creator, and how much).
    const bySupporter = await this.prisma.giftTransaction.groupBy({
      by: ['viewerId'],
      where: { creatorId: userId },
      _sum: { totalCoinAmount: true },
      orderBy: { _sum: { totalCoinAmount: 'desc' } }
    });
    const totalGiftIncomeCoins = bySupporter.reduce((s, r) => s + (r._sum.totalCoinAmount ?? 0), 0);
    const top = bySupporter[0];
    const topSupporterCoins = top?._sum.totalCoinAmount ?? 0;

    // Reciprocal: has the creator gifted back to ANY of its top-3 supporters?
    const topSupporterIds = bySupporter.slice(0, 3).map((r) => r.viewerId);
    const reciprocal = topSupporterIds.length
      ? await this.prisma.giftTransaction.findFirst({ where: { viewerId: userId, creatorId: { in: topSupporterIds } } })
      : null;

    // Spike: last-24h income vs the average daily income over the prior baseline window.
    const since24h = new Date(now - DAY_MS);
    const sinceBaseline = new Date(now - (BASELINE_DAYS + 1) * DAY_MS);
    const [last24, baselineWindow] = await Promise.all([
      this.prisma.giftTransaction.aggregate({ where: { creatorId: userId, createdAt: { gte: since24h } }, _sum: { totalCoinAmount: true } }),
      this.prisma.giftTransaction.aggregate({
        where: { creatorId: userId, createdAt: { gte: sinceBaseline, lt: since24h } },
        _sum: { totalCoinAmount: true }
      })
    ]);
    const last24hIncomeCoins = last24._sum.totalCoinAmount ?? 0;
    const dailyBaselineCoins = (baselineWindow._sum.totalCoinAmount ?? 0) / BASELINE_DAYS;

    const features: FraudFeatures = {
      accountAgeDays,
      totalGiftIncomeCoins,
      topSupporterCoins,
      topSupporterIsReciprocated: !!reciprocal,
      last24hIncomeCoins,
      dailyBaselineCoins
    };

    return { userId, features, ...evaluateFraudSignals(features) };
  }

  // Group-aggregate assessment (R4 §7 gate): coordinated rings where every
  // member looks clean individually but the group's gift flow is circular.
  // A "group" is any user-id set — a future Circle, a mission cohort, or an
  // ad-hoc reviewer selection. Read-only, explainable, same action ladder.
  async assessGroup(userIds: string[]) {
    const ids = [...new Set(userIds)];
    if (ids.length < 2) throw new BadRequestException('A group assessment needs at least 2 distinct user ids');
    if (ids.length > 200) throw new BadRequestException('Group too large (max 200 members)');

    const users = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, createdAt: true } });
    if (users.length < 2) throw new BadRequestException('Fewer than 2 of the given user ids exist');

    const now = Date.now();
    const memberIds = users.map((u) => u.id);
    const youngCutoff = now - GROUP_FRAUD_THRESHOLDS.youngDays * DAY_MS;
    const youngMemberCount = users.filter((u) => u.createdAt.getTime() > youngCutoff).length;

    const since24h = new Date(now - DAY_MS);
    const sinceBaseline = new Date(now - (BASELINE_DAYS + 1) * DAY_MS);
    const internalWhere = { viewerId: { in: memberIds }, creatorId: { in: memberIds } };
    const [total, internal, internal24h, internalBaseline] = await Promise.all([
      // all gift volume touching the group on either side
      this.prisma.giftTransaction.aggregate({
        where: { OR: [{ viewerId: { in: memberIds } }, { creatorId: { in: memberIds } }] },
        _sum: { totalCoinAmount: true }
      }),
      // volume that never leaves the group (both sender and receiver are members)
      this.prisma.giftTransaction.aggregate({ where: internalWhere, _sum: { totalCoinAmount: true } }),
      this.prisma.giftTransaction.aggregate({ where: { ...internalWhere, createdAt: { gte: since24h } }, _sum: { totalCoinAmount: true } }),
      this.prisma.giftTransaction.aggregate({
        where: { ...internalWhere, createdAt: { gte: sinceBaseline, lt: since24h } },
        _sum: { totalCoinAmount: true }
      })
    ]);

    const features: GroupFraudFeatures = {
      memberCount: users.length,
      youngMemberCount,
      totalGiftCoins: total._sum.totalCoinAmount ?? 0,
      internalGiftCoins: internal._sum.totalCoinAmount ?? 0,
      last24hInternalCoins: internal24h._sum.totalCoinAmount ?? 0,
      dailyBaselineInternalCoins: (internalBaseline._sum.totalCoinAmount ?? 0) / BASELINE_DAYS
    };

    return { userIds: memberIds, features, ...evaluateGroupFraudSignals(features) };
  }
}
