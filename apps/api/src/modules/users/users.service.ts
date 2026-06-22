import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, creatorProfile: true } });
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.profile.update({ where: { userId }, data: dto });
  }

  follow(followerId: string, followingId: string) {
    return this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      update: {},
      create: { followerId, followingId }
    });
  }

  // Idempotent: deleteMany so unfollowing when not following is a no-op, not an error.
  async unfollow(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });
    return { ok: true };
  }

  block(blockerId: string, blockedId: string) {
    return this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: {},
      create: { blockerId, blockedId }
    });
  }

  // Idempotent: deleteMany so unblocking when not blocked is a no-op, not an error.
  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { ok: true };
  }

  // Block has no Prisma relation to User, so resolve the blocked users in a
  // second query and return only safe public fields, newest block first.
  async listBlocked(blockerId: string) {
    const blocks = await this.prisma.block.findMany({
      where: { blockerId },
      orderBy: { createdAt: 'desc' }
    });
    if (blocks.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: blocks.map((b) => b.blockedId) } },
      select: { id: true, profile: true, creatorProfile: { select: { stageName: true } } }
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return blocks.map((b) => {
      const u = byId.get(b.blockedId);
      return {
        id: b.blockedId,
        blockedAt: b.createdAt,
        displayName: u?.creatorProfile?.stageName ?? u?.profile?.displayName ?? 'Unknown user',
        avatarUrl: u?.profile?.avatarUrl ?? null
      };
    });
  }
}
