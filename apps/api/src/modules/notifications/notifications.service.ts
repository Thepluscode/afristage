import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
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
      }))
    });
    return { created: followers.length };
  }
}
