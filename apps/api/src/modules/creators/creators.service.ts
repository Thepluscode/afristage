import { Injectable } from '@nestjs/common';
import { CreatorApprovalStatus, RoomStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ApplyCreatorDto } from './dto/apply-creator.dto';

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService, private readonly wallet: WalletService) {}

  // Beta: applying does NOT promote the user to CREATOR. It records a PENDING
  // application that an admin must approve before any live room can be created.
  async apply(userId: string, dto: ApplyCreatorDto) {
    const profile = await this.prisma.creatorProfile.upsert({
      where: { userId },
      update: { ...dto, approvalStatus: CreatorApprovalStatus.PENDING, rejectionReason: null },
      create: { userId, ...dto, approvalStatus: CreatorApprovalStatus.PENDING }
    });
    await this.wallet.ensureUserWallets(userId, 'COIN');
    return profile;
  }

  async approveCreator(actorId: string, creatorUserId: string) {
    const creator = await this.prisma.creatorProfile.update({
      where: { userId: creatorUserId },
      data: { approvalStatus: CreatorApprovalStatus.APPROVED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: null }
    });
    await this.prisma.user.update({ where: { id: creatorUserId }, data: { role: UserRole.CREATOR } });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_APPROVED', target: `creator:${creatorUserId}`, metadata: { creatorProfileId: creator.id } }
    });
    return creator;
  }

  async suspendCreator(actorId: string, creatorUserId: string, reason: string) {
    const creator = await this.prisma.creatorProfile.update({
      where: { userId: creatorUserId },
      data: { approvalStatus: CreatorApprovalStatus.SUSPENDED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason }
    });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_SUSPENDED', target: `creator:${creatorUserId}`, metadata: { reason } }
    });
    return creator;
  }

  async rejectCreator(actorId: string, creatorUserId: string, reason: string) {
    const creator = await this.prisma.creatorProfile.update({
      where: { userId: creatorUserId },
      data: { approvalStatus: CreatorApprovalStatus.REJECTED, reviewedById: actorId, reviewedAt: new Date(), rejectionReason: reason }
    });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'CREATOR_REJECTED', target: `creator:${creatorUserId}`, metadata: { reason } }
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
      this.prisma.giftTransaction.groupBy({
        by: ['viewerId'],
        where: { creatorId: userId },
        _sum: { totalCoinAmount: true },
        // Stable order: coins desc, then viewerId for a deterministic tie-break.
        orderBy: [{ _sum: { totalCoinAmount: 'desc' } }, { viewerId: 'asc' }],
        take: 3
      })
    ]);
    // GiftTransaction has no relation to the supporter's profile — resolve names
    // in a second query and expose only safe public fields.
    const supporterIds = supporterAgg.map((s) => s.viewerId);
    const profiles = supporterIds.length
      ? await this.prisma.profile.findMany({
          where: { userId: { in: supporterIds } },
          select: { userId: true, displayName: true, avatarUrl: true }
        })
      : [];
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    const topSupporters = supporterAgg.map((s) => ({
      userId: s.viewerId,
      displayName: byId.get(s.viewerId)?.displayName ?? 'Supporter',
      avatarUrl: byId.get(s.viewerId)?.avatarUrl ?? null,
      coins: s._sum.totalCoinAmount ?? 0
    }));
    return {
      creator,
      avatarUrl: profile?.avatarUrl ?? null,
      earnings,
      totalGiftTransactions: gifts,
      totalRooms: rooms,
      followers,
      totalWatchSeconds: watchAgg._sum.totalWatchSeconds ?? 0n,
      topSupporters
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
    return { ...creator, followers, totalRooms, liveRoom, upcomingRoom, isFollowing: followCount > 0, peakViewers: peakAgg._max.peakViewers ?? 0 };
  }
}
