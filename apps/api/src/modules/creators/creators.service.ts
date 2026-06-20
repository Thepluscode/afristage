import { Injectable } from '@nestjs/common';
import { CreatorApprovalStatus, UserRole } from '@prisma/client';
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
    const earnings = await this.wallet.balance(userId, 'EARNING', 'COIN');
    const gifts = await this.prisma.giftTransaction.count({ where: { creatorId: userId } });
    const rooms = await this.prisma.liveRoom.count({ where: { hostUserId: userId } });
    return { creator, earnings, totalGiftTransactions: gifts, totalRooms: rooms };
  }

  getPublic(id: string) {
    return this.prisma.creatorProfile.findFirst({ where: { OR: [{ id }, { userId: id }] }, include: { user: { include: { profile: true } } } });
  }
}
