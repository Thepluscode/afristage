import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { isNotificationType, NOTIFICATION_TYPES, NotificationType } from './notification-types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // Bell-badge count: unread = readAt still null.
  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  // Mark every unread notification for this user read in one call.
  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true, count };
  }

  // Scoped to the owner: updateMany with userId so one user can't mark another's
  // notification read.
  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // The full taxonomy with this user's effective enabled flag (default true —
  // a preference row exists only when the user changed it). Transactional
  // types report enabled=true unconditionally.
  async preferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(rows.map((r) => [r.type, r.enabled]));
    return (Object.keys(NOTIFICATION_TYPES) as NotificationType[]).map((type) => {
      const meta = NOTIFICATION_TYPES[type];
      return {
        type,
        label: meta.label,
        description: meta.description,
        optOut: meta.optOut,
        enabled: meta.optOut ? byType.get(type) ?? true : true
      };
    });
  }

  async setPreference(userId: string, type: string, enabled: boolean) {
    if (!isNotificationType(type)) throw new BadRequestException(`Unknown notification type: ${type}`);
    if (!NOTIFICATION_TYPES[type].optOut) throw new BadRequestException(`${type} notifications cannot be disabled`);
    await this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: { userId, type, enabled },
      update: { enabled }
    });
    return { ok: true, type, enabled };
  }

  // True when this user turned the type off (transactional types can't be).
  private async optedOut(userId: string, type: NotificationType): Promise<boolean> {
    if (!NOTIFICATION_TYPES[type].optOut) return false;
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return pref?.enabled === false;
  }

  // True when a notification of this type (scoped to the room when given) was
  // already delivered to this user inside the type's throttle window.
  private async throttled(userId: string, type: NotificationType, roomId?: string): Promise<boolean> {
    const minutes = NOTIFICATION_TYPES[type].throttleMinutes;
    if (!minutes) return false;
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const recent = await this.prisma.notification.count({
      where: { userId, type, createdAt: { gte: since }, ...(roomId ? { roomId } : {}) }
    });
    return recent > 0;
  }

  // Single-user notification. Callers own the copy; this enforces the taxonomy
  // (an unknown type is a bug, not a new category), the user's opt-out, and the
  // type's throttle window. Returns null when suppressed.
  async notifyUser(userId: string, type: string, title: string, body: string, roomId?: string) {
    if (!isNotificationType(type)) throw new BadRequestException(`Unknown notification type: ${type}`);
    if (await this.optedOut(userId, type)) return null;
    if (await this.throttled(userId, type, roomId)) return null;
    return this.prisma.notification.create({ data: { userId, type, title, body, roomId } });
  }

  // CREATOR_LIVE fan-out when a room goes live: followers plus anyone who set a
  // reminder for this room, deduped, never the host. The generic CREATOR_LIVE
  // opt-out silences follower pings but NOT reminders (a reminder is an explicit
  // per-room request). The per-room throttle window applies to everyone so a
  // host restarting the room can't re-ping the audience.
  async notifyRoomLive(hostUserId: string, roomId: string, title: string, reminderUserIds: string[] = []) {
    const followers = await this.prisma.follow.findMany({ where: { followingId: hostUserId } });
    let followerIds = followers.map((follow) => follow.followerId).filter((id) => id !== hostUserId);
    const reminders = [...new Set(reminderUserIds)].filter((id) => id !== hostUserId);

    // Opt-out filter — followers only.
    if (followerIds.length) {
      const optedOut = await this.prisma.notificationPreference.findMany({
        where: { type: 'CREATOR_LIVE', enabled: false, userId: { in: followerIds } },
        select: { userId: true }
      });
      const out = new Set(optedOut.map((p) => p.userId));
      followerIds = followerIds.filter((id) => !out.has(id));
    }

    let ids = [...new Set([...followerIds, ...reminders])];
    if (!ids.length) return { created: 0 };

    // Throttle filter — everyone: already pinged for this room in-window.
    const minutes = NOTIFICATION_TYPES.CREATOR_LIVE.throttleMinutes;
    if (minutes) {
      const since = new Date(Date.now() - minutes * 60 * 1000);
      const recent = await this.prisma.notification.findMany({
        where: { type: 'CREATOR_LIVE', roomId, createdAt: { gte: since }, userId: { in: ids } },
        select: { userId: true }
      });
      const pinged = new Set(recent.map((n) => n.userId));
      ids = ids.filter((id) => !pinged.has(id));
    }
    if (!ids.length) return { created: 0 };

    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: 'CREATOR_LIVE',
        title: 'Creator is live',
        body: title,
        roomId
      }))
    });
    return { created: ids.length };
  }
}
