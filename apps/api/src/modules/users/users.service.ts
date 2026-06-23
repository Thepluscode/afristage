import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true, creatorProfile: true } });
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.profile.update({ where: { userId }, data: dto });
  }

  async follow(followerId: string, followingId: string) {
    // A self-follow would silently inflate follower counts — reject it.
    if (followerId === followingId) throw new BadRequestException('Cannot follow yourself');
    // create (not upsert) so a unique-violation tells us this is a re-follow and we
    // skip re-notifying. Only a genuinely new follow notifies the followed user.
    try {
      const follow = await this.prisma.follow.create({ data: { followerId, followingId } });
      await this.notifyNewFollower(followerId, followingId);
      return follow;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.follow.findUniqueOrThrow({ where: { followerId_followingId: { followerId, followingId } } });
      }
      throw e;
    }
  }

  // Best-effort: a notification failure must never break the follow (optional
  // dependency — Rule 9).
  private async notifyNewFollower(followerId: string, followingId: string) {
    try {
      const follower = await this.prisma.profile.findUnique({ where: { userId: followerId } });
      const name = follower?.displayName ?? 'Someone';
      await this.notifications.notifyUser(followingId, 'NEW_FOLLOWER', 'New follower', `${name} started following you.`);
    } catch (e) {
      this.logger.warn(`new-follower notification failed for ${followingId}: ${(e as Error).message}`);
    }
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
