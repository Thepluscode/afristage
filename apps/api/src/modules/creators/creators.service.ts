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

  async dashboard(userId: string) {
    const creator = await this.getMe(userId);
    const [earnings, gifts, rooms, followers, supporterAgg] = await Promise.all([
      this.wallet.balance(userId, 'EARNING', 'COIN'),
      this.prisma.giftTransaction.count({ where: { creatorId: userId } }),
      this.prisma.liveRoom.count({ where: { hostUserId: userId } }),
      this.prisma.follow.count({ where: { followingId: userId } }),
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
    return { creator, earnings, totalGiftTransactions: gifts, totalRooms: rooms, followers, topSupporters };
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
    const [followers, totalRooms, liveRoom, followCount, peakAgg] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: creatorUserId } }),
      this.prisma.liveRoom.count({ where: { hostUserId: creatorUserId } }),
      this.prisma.liveRoom.findFirst({
        where: { hostUserId: creatorUserId, status: RoomStatus.LIVE },
        select: { id: true, title: true, category: true, country: true, language: true }
      }),
      viewerId && viewerId !== creatorUserId
        ? this.prisma.follow.count({ where: { followerId: viewerId, followingId: creatorUserId } })
        : Promise.resolve(0),
      this.prisma.liveRoom.aggregate({ where: { hostUserId: creatorUserId }, _max: { peakViewers: true } })
    ]);
    return { ...creator, followers, totalRooms, liveRoom, isFollowing: followCount > 0, peakViewers: peakAgg._max.peakViewers ?? 0 };
  }
}
