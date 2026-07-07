import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { MoneyService } from '../money/money.service';
import { WalletService } from '../wallet/wallet.service';
import { findMission, MISSION_CATALOG, MissionAction, utcDay, utcDayStart } from './mission-catalog';

// Claims from users at or above this risk score are refused (R4: anti-farming
// must run through the fraud scorer before any coin-granting mission).
const MISSION_FRAUD_BLOCK = () => Number(process.env.MISSION_FRAUD_BLOCK || 0.6);

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly money: MoneyService,
    private readonly fraud: FraudService
  ) {}

  // Today's progress for one action — a pure read over the existing event tables.
  private async progress(userId: string, action: MissionAction, since: Date): Promise<number> {
    switch (action) {
      case 'ROOM_JOIN':
        return this.prisma.roomParticipant.count({ where: { userId, joinedAt: { gte: since } } });
      case 'CHAT':
        return this.prisma.chatMessage.count({ where: { senderId: userId, createdAt: { gte: since } } });
      case 'FOLLOW':
        return this.prisma.follow.count({ where: { followerId: userId, createdAt: { gte: since } } });
      case 'GIFT':
        return this.prisma.giftTransaction.count({ where: { viewerId: userId, createdAt: { gte: since } } });
    }
  }

  // The daily mission board: every mission with progress, target, and claim state.
  async board(userId: string) {
    const day = utcDay();
    const since = utcDayStart();
    const claims = await this.prisma.missionClaim.findMany({ where: { userId, day } });
    const claimedKeys = new Set(claims.map((c) => c.missionKey));

    const missions = await Promise.all(
      MISSION_CATALOG.map(async (m) => {
        const done = Math.min(await this.progress(userId, m.action, since), m.target);
        const claimed = claimedKeys.has(m.key);
        return {
          key: m.key,
          label: m.label,
          target: m.target,
          rewardCoins: m.rewardCoins,
          progress: done,
          claimed,
          claimable: !claimed && done >= m.target
        };
      })
    );
    return { day, missions };
  }

  // Claim a completed mission: fraud-gated, double-claim-guarded, and paid by a
  // balanced ledger move PROMO -> user COIN. If the promo account lacks funds,
  // the non-negative guard rejects the post — the budget cap is real.
  async claim(userId: string, missionKey: string) {
    const mission = findMission(missionKey);
    if (!mission) throw new NotFoundException(`Unknown mission: ${missionKey}`);

    const day = utcDay();
    const existing = await this.prisma.missionClaim.findUnique({
      where: { userId_missionKey_day: { userId, missionKey, day } }
    });
    if (existing) return { ok: true, alreadyClaimed: true, rewardCoins: existing.rewardCoins };

    const done = await this.progress(userId, mission.action, utcDayStart());
    if (done < mission.target) {
      throw new BadRequestException(`Mission not complete: ${done}/${mission.target}`);
    }

    // Anti-farming gate: explainable fraud score; block at/above the threshold.
    const assessment = await this.fraud.assessCreatorCached(userId);
    if (assessment.riskScore >= MISSION_FRAUD_BLOCK()) {
      throw new BadRequestException('Mission rewards are temporarily unavailable for this account (under review)');
    }

    // Idempotent per (user, mission, day); the money catalog guards PROMO so an
    // empty promo pot fails the claim, never mints.
    const { transaction: tx } = await this.money.missionReward({
      userId,
      missionKey,
      day,
      rewardCoins: mission.rewardCoins
    });

    try {
      await this.prisma.missionClaim.create({
        data: { userId, missionKey, day, rewardCoins: mission.rewardCoins, ledgerTransactionId: tx.id }
      });
    } catch {
      // Lost a race to the unique claim row — the ledger post above was
      // idempotent, so exactly one reward was paid either way.
      return { ok: true, alreadyClaimed: true, rewardCoins: mission.rewardCoins };
    }
    return { ok: true, alreadyClaimed: false, rewardCoins: mission.rewardCoins };
  }

  // Ops view: promo budget remaining + what was claimed today.
  async promoStatus() {
    const promo = await this.wallet.ensureSystemAccount(WalletAccountType.PROMO, 'COIN');
    const day = utcDay();
    const [claimsToday, coinsToday] = await Promise.all([
      this.prisma.missionClaim.count({ where: { day } }),
      this.prisma.missionClaim.aggregate({ where: { day }, _sum: { rewardCoins: true } })
    ]);
    return {
      promoBalanceCoins: BigInt(promo.balanceMinor).toString(),
      day,
      claimsToday,
      coinsClaimedToday: coinsToday._sum.rewardCoins ?? 0
    };
  }

  // Fund the mission budget by MOVING coins out of already-earned platform
  // revenue (never minting). The non-negative guard on PLATFORM_REVENUE means
  // the platform cannot promise rewards it hasn't earned.
  async fund(adminUserId: string, coins: number) {
    if (!Number.isInteger(coins) || coins <= 0) throw new BadRequestException('coins must be a positive integer');
    const { transaction: tx } = await this.money.promoFund({ adminUserId, coins, nonce: Date.now() });
    return { ok: true, funded: coins, ledgerTransactionId: tx.id };
  }
}
