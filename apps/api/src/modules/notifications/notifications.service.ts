import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // Scoped to the owner: updateMany with userId so one user can't mark another's
  // notification read.
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // Generic single-user notification. Callers own the copy; this just persists it.
  notifyUser(userId: string, type: string, title: string, body: string) {
    return this.prisma.notification.create({ data: { userId, type, title, body } });
  }

  async notifyFollowersCreatorLive(creatorUserId: string, roomId: string, title: string) {
    const followers = await this.prisma.follow.findMany({ where: { followingId: creatorUserId } });
    if (!followers.length) return { created: 0 };
    await this.prisma.notification.createMany({
      data: followers.map((follow) => ({
        userId: follow.followerId,
        type: 'CREATOR_LIVE',
        title: 'Creator is live',
        body: title,
        roomId,
      }))
    });
    return { created: followers.length };
  }
}
