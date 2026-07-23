import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RoomStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RoomBroadcast, RoomPresence } from '../chat/room-events';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLiveRoomDto } from './dto/create-live-room.dto';
import { FeedEngine, FeedQuery } from './feed-engine.service';
import { PUBLIC_HOST_INCLUDE } from './public-host';
import { LiveKitService } from './livekit.service';

@Injectable()
export class LiveRoomsService {
  private readonly logger = new Logger(LiveRoomsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly broadcast: RoomBroadcast,
    private readonly presence: RoomPresence,
    private readonly notifications: NotificationsService,
    private readonly feed: FeedEngine
  ) {}

  async create(hostUserId: string, dto: CreateLiveRoomDto) {
    const user = await this.prisma.user.findUnique({ where: { id: hostUserId } });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('User is not active');
    if (user.role !== UserRole.CREATOR && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only creators can create live rooms');
    }
    // Beta gate: a CREATOR must be APPROVED before going live. Admins bypass.
    if (user.role === UserRole.CREATOR) {
      const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: hostUserId } });
      if (!creator || creator.approvalStatus !== 'APPROVED') {
        throw new ForbiddenException('Creator approval required before going live');
      }
    }
    const active = await this.prisma.liveRoom.findFirst({ where: { hostUserId, status: RoomStatus.LIVE } });
    if (active) throw new BadRequestException('Creator already has an active live room');
    return this.prisma.liveRoom.create({ data: { hostUserId, ...dto, status: RoomStatus.SCHEDULED } });
  }

  // Set a "remind me" for a scheduled room. Idempotent (unique on roomId+userId);
  // only valid while the room hasn't started yet — a reminder fires on start.
  async setReminder(userId: string, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.status !== RoomStatus.SCHEDULED) throw new BadRequestException('Reminders are only for scheduled rooms');
    await this.prisma.roomReminder.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId },
      update: {}
    });
    return { roomId, reminded: true };
  }

  // Idempotent: deleteMany so cancelling when not set is a no-op, not an error.
  async cancelReminder(userId: string, roomId: string) {
    await this.prisma.roomReminder.deleteMany({ where: { roomId, userId } });
    return { roomId, reminded: false };
  }

  // Upcoming feed: scheduled rooms with a future announced start, soonest first.
  async upcoming(limit = 50) {
    const take = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100); // bounded: 1..100
    return this.prisma.liveRoom.findMany({
      where: { status: RoomStatus.SCHEDULED, scheduledStartAt: { gte: new Date() } },
      orderBy: { scheduledStartAt: 'asc' },
      take,
      include: PUBLIC_HOST_INCLUDE
    });
  }

  async start(hostUserId: string, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== hostUserId) throw new ForbiddenException('Not room host');
    const host = await this.prisma.user.findUnique({ where: { id: hostUserId } });
    if (!host || host.status !== 'ACTIVE') throw new ForbiddenException('Host is not active');
    if (room.status === RoomStatus.LIVE) throw new BadRequestException('Room already live');
    if (room.status === RoomStatus.ENDED || room.status === RoomStatus.SUSPENDED) {
      throw new BadRequestException(`Cannot start room from status ${room.status}`);
    }
    const livekitRoomName = `afristage-${room.id}`;
    const updated = await this.prisma.liveRoom.update({
      where: { id: room.id },
      data: { status: RoomStatus.LIVE, livekitRoomName, startedAt: new Date() }
    });
    await this.feed.invalidate(); // a room went live — don't serve a stale slice for up to a TTL
    // Notify followers AND anyone who set a reminder for this specific room —
    // routed through the notifications service so the CREATOR_LIVE opt-out and
    // per-room throttle apply (reminders override the opt-out: they're an
    // explicit per-room request). Reminders are one-shot: clear them once fired.
    const reminders = await this.prisma.roomReminder.findMany({ where: { roomId: updated.id } });
    await this.notifications.notifyRoomLive(hostUserId, updated.id, updated.title, reminders.map((r) => r.userId));
    if (reminders.length) await this.prisma.roomReminder.deleteMany({ where: { roomId: updated.id } });
    return {
      ...updated,
      hostToken: await this.livekit.createToken({ roomName: livekitRoomName, identity: hostUserId, canPublish: true }),
      livekitUrl: this.livekit.url()
    };
  }

  async end(hostUserId: string, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== hostUserId) throw new ForbiddenException('Not room host');
    const updated = await this.prisma.liveRoom.update({ where: { id: roomId }, data: { status: RoomStatus.ENDED, endedAt: new Date() } });
    await this.feed.invalidate();
    this.broadcast.emit(roomId, 'room.ended', { roomId, reason: 'HOST_ENDED' });
    return updated;
  }

  // The ranked feed lives in FeedEngine (candidate #3): lifecycle code only
  // reads it and invalidates it.
  list(query: FeedQuery) {
    return this.feed.list(query);
  }

  async get(id: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id }, include: PUBLIC_HOST_INCLUDE });
    return room && { ...room, viewerCount: this.presence.viewerCount(id) || room.peakViewers };
  }

  async joinToken(userId: string, roomId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('User is not active');
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE || !room.livekitRoomName) throw new BadRequestException('Room is not live');
    // Dedup: re-joining must not pile up participant rows (join-spam). One row per (room,user).
    await this.prisma.roomParticipant.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId },
      update: { leftAt: null, joinedAt: new Date() }
    });
    return {
      roomId,
      viewerToken: await this.livekit.createToken({ roomName: room.livekitRoomName, identity: userId, canPublish: false }),
      livekitUrl: this.livekit.url(),
      roomStatus: room.status,
      chatSocketPath: '/chat'
    };
  }

  // PUBLIC, view-only token so a signed-OUT visitor can watch a live room from a
  // shared link — the "watch free, no card required" the landing already promises.
  // Security: canPublish:false (a guest can NEVER publish/hijack a stream), and a
  // token is minted ONLY for a LIVE room (nothing leaks for scheduled/ended ids).
  // A fresh random identity per call keeps LiveKit participants distinct. No
  // participant row is written (guests aren't tracked users); sign-up is gated at
  // the gift/buy action, not at watching.
  async guestToken(roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room || room.status !== RoomStatus.LIVE || !room.livekitRoomName) {
      throw new BadRequestException('Room is not live');
    }
    return {
      roomId,
      viewerToken: await this.livekit.createToken({
        roomName: room.livekitRoomName,
        identity: `guest_${randomUUID()}`,
        canPublish: false
      }),
      livekitUrl: this.livekit.url(),
      roomStatus: room.status
    };
  }

  // Admin force-end a room (regardless of host), with an audit trail.
  async adminEnd(actorId: string, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    const updated = await this.prisma.liveRoom.update({ where: { id: roomId }, data: { status: RoomStatus.ENDED, endedAt: new Date() } });
    await this.feed.invalidate();
    await this.prisma.adminAuditLog.create({ data: { actorId, action: 'room.ended', target: roomId, metadata: {} } });
    this.broadcast.emit(roomId, 'room.ended', { roomId, reason: 'ADMIN_ENDED' });
    return updated;
  }

  // Auto-end zombie rooms: LIVE rooms whose last activity (start, chat, or gift)
  // is older than the idle window. Prevents rooms staying "live" after a host crash.
  async endStaleRooms(maxIdleMinutes = Number(process.env.ROOM_STALE_MINUTES || 30)) {
    const cutoff = new Date(Date.now() - maxIdleMinutes * 60_000);
    const live = await this.prisma.liveRoom.findMany({ where: { status: RoomStatus.LIVE } });
    const ended: string[] = [];

    for (const room of live) {
      const [lastChat, lastGift] = await Promise.all([
        this.prisma.chatMessage.findFirst({ where: { roomId: room.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        this.prisma.giftTransaction.findFirst({ where: { roomId: room.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
      ]);
      const stamps = [room.startedAt, lastChat?.createdAt, lastGift?.createdAt].filter((d): d is Date => !!d);
      const lastActivity = stamps.length ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : room.createdAt;

      if (lastActivity < cutoff) {
        await this.prisma.liveRoom.update({ where: { id: room.id }, data: { status: RoomStatus.ENDED, endedAt: new Date() } });
        ended.push(room.id);
      }
    }

    if (ended.length) {
      await this.feed.invalidate(); // ended rooms must leave the feed now, not after a TTL
      this.logger.warn(`Auto-ended ${ended.length} stale room(s): ${ended.join(', ')}`);
    }
    return { ended, maxIdleMinutes };
  }
}
