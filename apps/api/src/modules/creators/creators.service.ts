import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { CreatorApprovalStatus, KycStatus, Prisma, RoomStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { coinFiatRate } from '../payouts/payouts.service';
import { AggregationService } from '../aggregation/aggregation.service';
import { WalletService } from '../wallet/wallet.service';
import { ApplyCreatorDto } from './dto/apply-creator.dto';

// A non-human actor for the beta auto-approval trail. AdminAuditLog.actorId has
// no foreign key, so this cannot collide with a real user id.
export const AUTO_APPROVE_ACTOR = 'system:beta-auto-approve';

@Injectable()
export class CreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly agg: AggregationService
  ) {}

  // CreatorProfile is one row with TWO editors: the applicant owns the
  // application text, a reviewer owns the decision. Saving it as one whole
  // object made the applicant's save clobber the reviewer's — an admin could
  // approve a creator and have that approval silently reverted to PENDING by
  // the applicant's next save (leaving reviewedById dangling on a decision that
  // no longer existed, and the user still holding role=CREATOR). A suspended
  // creator could also clear their own suspension just by re-submitting.
  //
  // So the row is split by ownership rather than saved wholesale:
  //   - application text (stageName/category/country/language) — one owner, so
  //     last-write-wins is correct and stays;
  //   - the decision (approvalStatus/reviewedBy/rejectionReason) — shared, and
  //     APPROVED vs PENDING do not merge, so the applicant never writes it
  //     except through an explicit, legal re-application;
  //   - every save is recorded as an immutable event, so when the two editors
  //     do collide the order is visible and auditable rather than inferred.
  async apply(userId: string, dto: ApplyCreatorDto) {
    const existing = await this.prisma.creatorProfile.findUnique({ where: { userId } });

    if (!existing) {
      const created = await this.prisma.creatorProfile.create({
        data: { userId, ...dto, approvalStatus: CreatorApprovalStatus.PENDING }
      });
      await this.wallet.ensureUserWallets(userId, 'COIN');
      await this.recordApplication(userId, 'CREATOR_APPLIED', dto, null);
      return CreatorsService.autoApproveEnabled() ? this.autoApprove(userId) : created;
    }

    // Re-submitting is not a way out of a suspension — that decision is the
    // reviewer's to reverse.
    if (existing.approvalStatus === CreatorApprovalStatus.SUSPENDED) {
      throw new ForbiddenException('Your creator account is suspended — contact support to appeal');
    }

    // A rejected applicant re-applying legitimately re-opens review, and the
    // stale reviewer/reason are cleared with it. An approved creator editing
    // their details keeps the approval they were granted; a pending one stays
    // pending. In no case does the applicant's save decide their own status.
    const reopening = existing.approvalStatus === CreatorApprovalStatus.REJECTED;
    const decision = reopening
      ? { approvalStatus: CreatorApprovalStatus.PENDING, rejectionReason: null, reviewedById: null, reviewedAt: null }
      : {};

    let updated;
    try {
      updated = await this.prisma.creatorProfile.update({
        // Conditional on the decision the applicant's save was computed against,
        // so a review landing in the same instant is never silently discarded.
        where: { userId, approvalStatus: existing.approvalStatus },
        data: { ...dto, ...decision }
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('Your application was reviewed while you were editing — reload and try again');
      }
      throw e;
    }

    await this.wallet.ensureUserWallets(userId, 'COIN');
    await this.recordApplication(userId, reopening ? 'CREATOR_REAPPLIED' : 'CREATOR_APPLICATION_AMENDED', dto, existing.approvalStatus);
    // Only an application that is actually awaiting review is auto-approved. An
    // approved creator amending their details is already approved, and a
    // suspended one never reaches here.
    const awaitingReview = reopening || existing.approvalStatus === CreatorApprovalStatus.PENDING;
    return CreatorsService.autoApproveEnabled() && awaitingReview ? this.autoApprove(userId) : updated;
  }

  // Beta convenience: approving every applicant by hand is a human in the loop
  // for every creator recruited, and while nobody is watching the queue they all
  // sit PENDING looking at "your application is under review". The flag removes
  // that bottleneck for a controlled beta.
  //
  // It is a deliberate weakening of a safety gate and is treated as one: default
  // off, refused outright in production by validate-env, and every approval it
  // grants is audited under its own action with a NON-HUMAN actor, so the
  // trail never implies a reviewer looked at something they didn't.
  private static autoApproveEnabled(): boolean {
    return process.env.BETA_AUTO_APPROVE_CREATORS === 'true';
  }

  private async autoApprove(userId: string) {
    const approved = await this.prisma.creatorProfile.update({
      where: { userId },
      data: { approvalStatus: CreatorApprovalStatus.APPROVED, reviewedAt: new Date(), rejectionReason: null }
    });
    await this.prisma.user.update({ where: { id: userId }, data: { role: UserRole.CREATOR } });
    await this.prisma.adminAuditLog.create({
      data: {
        // Not a person. Attributing this to the applicant, or to any admin,
        // would put a name against a review that never happened.
        actorId: AUTO_APPROVE_ACTOR,
        action: 'CREATOR_AUTO_APPROVED',
        target: `creator:${userId}`,
        metadata: { reason: 'BETA_AUTO_APPROVE_CREATORS', creatorProfileId: approved.id }
      }
    });
    return approved;
  }

  // The applicant's own edits were previously invisible: only admin decisions
  // were logged, so a status that changed under a reviewer's feet could not be
  // explained afterwards. Both editors now write to the same append-only log.
  private recordApplication(
    userId: string,
    action: string,
    dto: ApplyCreatorDto,
    fromStatus: CreatorApprovalStatus | null
  ) {
    return this.prisma.adminAuditLog.create({
      data: { actorId: userId, action, target: `creator:${userId}`, metadata: { ...dto, fromStatus } }
    });
  }

  // A reviewer decides against the application as they last read it. If the
  // applicant amended it (or another reviewer already decided) in between, the
  // decision is refused rather than applied to something the reviewer never saw.
  // `expectedStatus` is the status the reviewer acted from; omitted means "any".
  private async decide(
    creatorUserId: string,
    data: Prisma.CreatorProfileUncheckedUpdateInput,
    expectedStatus?: CreatorApprovalStatus
  ) {
    try {
      return await this.prisma.creatorProfile.update({
        where: expectedStatus ? { userId: creatorUserId, approvalStatus: expectedStatus } : { userId: creatorUserId },
        data
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new ConflictException('This application changed since you opened it — reload and review again');
      }
      throw e;
    }
  }

  async approveCreator(actorId: string, creatorUserId: string, expectedStatus?: CreatorApprovalStatus) {
    const creator = await this.decide(
      creatorUserId,
      { approvalStatus: CreatorApprovalStatus.APPROVED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: null },
      expectedStatus
    );
    await this.prisma.user.update({ where: { id: creatorUserId }, data: { role: UserRole.CREATOR } });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_APPROVED', target: `creator:${creatorUserId}`, metadata: { creatorProfileId: creator.id } }
    });
    return creator;
  }

  async suspendCreator(actorId: string, creatorUserId: string, reason: string, expectedStatus?: CreatorApprovalStatus) {
    const creator = await this.decide(
      creatorUserId,
      { approvalStatus: CreatorApprovalStatus.SUSPENDED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason },
      expectedStatus
    );
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_SUSPENDED', target: `creator:${creatorUserId}`, metadata: { reason } }
    });
    return creator;
  }

  async rejectCreator(actorId: string, creatorUserId: string, reason: string, expectedStatus?: CreatorApprovalStatus) {
    const creator = await this.decide(
      creatorUserId,
      { approvalStatus: CreatorApprovalStatus.REJECTED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason },
      expectedStatus
    );
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_REJECTED', target: `creator:${creatorUserId}`, metadata: { reason } }
    });
    return creator;
  }

  // Beta payout enablement (the payout gate needs payoutEnabled AND kycStatus APPROVED,
  // and there is no self-serve KYC flow yet). Enabling sets both; disabling flips only
  // the flag. Audited like the other creator moderation actions.
  async setPayoutEligibility(actorId: string, creatorUserId: string, enabled: boolean) {
    const creator = await this.prisma.creatorProfile.update({
      where: { userId: creatorUserId },
      data: enabled
        ? { payoutEnabled: true, kycStatus: KycStatus.APPROVED, reviewedById: actorId, reviewedAt: new Date() }
        : { payoutEnabled: false, reviewedById: actorId, reviewedAt: new Date() }
    });
    await this.prisma.adminAuditLog.create({
      data: {
        actorId,
        action: enabled ? 'CREATOR_PAYOUT_ENABLED' : 'CREATOR_PAYOUT_DISABLED',
        target: `creator:${creatorUserId}`,
        metadata: { payoutEnabled: enabled, kycStatus: creator.kycStatus }
      }
    });
    return creator;
  }

  getMe(userId: string) {
    return this.prisma.creatorProfile.findUnique({ where: { userId } });
  }

  // Per-room performance for the creator: each of their rooms with peak viewers,
  // watch-time, and gift volume. GiftTransaction sums are joined in a second
  // grouped query (no per-room N+1).
  async myRooms(userId: string, limit = 50) {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100); // bounded: 1..100
    const rooms = await this.prisma.liveRoom.findMany({
      where: { hostUserId: userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        peakViewers: true,
        totalWatchSeconds: true,
        startedAt: true,
        endedAt: true,
        createdAt: true
      }
    });
    if (!rooms.length) return [];

    const giftAgg = await this.prisma.giftTransaction.groupBy({
      by: ['roomId'],
      where: { roomId: { in: rooms.map((r) => r.id) } },
      _sum: { totalCoinAmount: true },
      _count: true
    });
    const byRoom = new Map(giftAgg.map((g) => [g.roomId, g]));
    return rooms.map((r) => ({
      ...r,
      giftVolumeCoins: byRoom.get(r.id)?._sum.totalCoinAmount ?? 0,
      giftCount: byRoom.get(r.id)?._count ?? 0
    }));
  }

  async dashboard(userId: string) {
    const creator = await this.getMe(userId);
    const [profile, earnings, gifts, rooms, followers, watchAgg, supporterAgg] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { avatarUrl: true, displayName: true } }),
      this.wallet.balance(userId, 'EARNING', 'COIN'),
      this.prisma.giftTransaction.count({ where: { creatorId: userId } }),
      this.prisma.liveRoom.count({ where: { hostUserId: userId } }),
      this.prisma.follow.count({ where: { followingId: userId } }),
      // Total watch-time across all of this creator's rooms (accumulated live by
      // the chat gateway as viewers leave/disconnect).
      this.prisma.liveRoom.aggregate({ where: { hostUserId: userId }, _sum: { totalWatchSeconds: true } }),
      // Top supporters across all of this creator's rooms, by coins gifted.
      this.agg.giftTotals({ by: 'viewerId', where: { creatorId: userId }, limit: 3 })
    ]);
    const byId = await this.agg.profilesFor(supporterAgg.map((s) => s.key));
    const topSupporters = supporterAgg.map((s) => ({
      userId: s.key,
      displayName: byId.get(s.key)?.displayName ?? 'Supporter',
      avatarUrl: byId.get(s.key)?.avatarUrl ?? null,
      coins: s.totalCoins
    }));
    return {
      creator,
      avatarUrl: profile?.avatarUrl ?? null,
      earnings,
      totalGiftTransactions: gifts,
      totalRooms: rooms,
      followers,
      totalWatchSeconds: watchAgg._sum.totalWatchSeconds ?? 0n,
      topSupporters,
      // Published 💎→fiat conversion so clients show the real cash value — the
      // SAME per-currency rate the payout path applies at cash-out (COIN_FIAT_RATES).
      payoutCurrency: process.env.CREATOR_PAYOUT_CURRENCY || 'NGN',
      payoutRate: coinFiatRate(process.env.CREATOR_PAYOUT_CURRENCY || 'NGN')
    };
  }

  // Public creator profile. Accepts either the creatorProfile id or the userId.
  // Enriched for the profile screen: follower count, whether the viewer follows
  // them, their current live room (if any), and total sessions hosted.
  async getPublic(id: string, viewerId?: string) {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: { user: { include: { profile: true } } }
    });
    if (!creator) return null;
    const creatorUserId = creator.userId;
    const [followers, totalRooms, liveRoom, followCount, peakAgg, upcomingRoom] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: creatorUserId } }),
      this.prisma.liveRoom.count({ where: { hostUserId: creatorUserId } }),
      this.prisma.liveRoom.findFirst({
        where: { hostUserId: creatorUserId, status: RoomStatus.LIVE },
        select: { id: true, title: true, category: true, country: true, language: true }
      }),
      viewerId && viewerId !== creatorUserId
        ? this.prisma.follow.count({ where: { followerId: viewerId, followingId: creatorUserId } })
        : Promise.resolve(0),
      this.prisma.liveRoom.aggregate({ where: { hostUserId: creatorUserId }, _max: { peakViewers: true } }),
      // The creator's next scheduled show, so a not-currently-live profile can
      // advertise when they're next on instead of a dead "Not live" state.
      this.prisma.liveRoom.findFirst({
        where: { hostUserId: creatorUserId, status: RoomStatus.SCHEDULED, scheduledStartAt: { gte: new Date() } },
        orderBy: { scheduledStartAt: 'asc' },
        select: { id: true, title: true, category: true, scheduledStartAt: true }
      })
    ]);
    // Tell the viewer whether they already have a reminder for the next show,
    // so the profile can render the correct toggle state.
    let upcoming = upcomingRoom as (typeof upcomingRoom & { reminded?: boolean }) | null;
    if (upcoming && viewerId) {
      const reminder = await this.prisma.roomReminder.findUnique({
        where: { roomId_userId: { roomId: upcoming.id, userId: viewerId } }
      });
      upcoming = { ...upcoming, reminded: !!reminder };
    }
    return { ...creator, followers, totalRooms, liveRoom, upcomingRoom: upcoming, isFollowing: followCount > 0, peakViewers: peakAgg._max.peakViewers ?? 0 };
  }
}
