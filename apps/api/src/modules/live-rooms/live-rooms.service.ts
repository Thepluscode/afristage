import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReportPriority, RoomStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { CreateLiveRoomDto } from './dto/create-live-room.dto';
import { LiveKitService } from './livekit.service';
import { REPORT_SEVERITY, RoomFeatures, scoreRoom } from './ranking';

const RANK_CANDIDATE_POOL = 100; // rooms we score per request
const RANK_RETURN = 50;
const GIFT_WINDOW_MINUTES = 10; // recent window for gift-velocity
const DAY_MS = 86_400_000;

// ponytail: never expose passwordHash/email/phone on a public host object. Safe fields only.
const PUBLIC_HOST_INCLUDE = {
  host: { select: { id: true, role: true, profile: true, creatorProfile: true } }
} as const;

@Injectable()
export class LiveRoomsService {
  private readonly logger = new Logger(LiveRoomsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly chat: ChatGateway
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
    const followers = await this.prisma.follow.findMany({ where: { followingId: hostUserId } });
    if (followers.length) {
      await this.prisma.notification.createMany({
        data: followers.map((follow) => ({
          userId: follow.followerId,
          type: 'CREATOR_LIVE',
          title: 'Creator is live',
          body: updated.title,
          roomId: updated.id
        }))
      });
    }
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
    this.chat.emitToRoom(roomId, 'room.ended', { roomId, reason: 'HOST_ENDED' });
    return updated;
  }

  // Ranked live feed. Explainable weighted score (see ranking.ts), not ML.
  // `country`/`category` stay hard filters; `viewerLanguage`/`viewerCountry` are
  // soft personalization boosts. Each returned room carries its `ranking`
  // breakdown so the feed order is auditable.
  // ponytail: per-request aggregation over a 100-room pool — fine at beta scale
  // (blueprint phase 1: ~100 live rooms). Move to cached counters if it gets hot.
  async list(query: { country?: string; category?: any; viewerLanguage?: string; viewerCountry?: string; q?: string }) {
    const q = query.q?.trim();
    const rooms = await this.prisma.liveRoom.findMany({
      where: {
        status: RoomStatus.LIVE,
        country: query.country,
        category: query.category,
        // Text search across room title and the creator's stage name.
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { host: { creatorProfile: { stageName: { contains: q, mode: 'insensitive' as const } } } }
              ]
            }
          : {})
      },
      orderBy: [{ peakViewers: 'desc' }, { startedAt: 'desc' }],
      take: RANK_CANDIDATE_POOL,
      include: PUBLIC_HOST_INCLUDE
    });
    if (rooms.length <= 1)
      return rooms.map((r) => ({ ...r, viewerCount: this.chat.countFor(r.id), ranking: scoreRoom(this.emptyFeatures(r, query)) }));

    const roomIds = rooms.map((r) => r.id);
    const hostIds = rooms.map((r) => r.hostUserId);
    const giftSince = new Date(Date.now() - GIFT_WINDOW_MINUTES * 60_000);

    const [participants, gifts, roomReports, hostReports] = await Promise.all([
      this.prisma.roomParticipant.findMany({
        where: { roomId: { in: roomIds }, leftAt: null },
        select: { roomId: true, joinedAt: true }
      }),
      this.prisma.giftTransaction.groupBy({
        by: ['roomId'],
        where: { roomId: { in: roomIds }, createdAt: { gte: giftSince } },
        _sum: { totalCoinAmount: true }
      }),
      this.prisma.report.findMany({
        where: { roomId: { in: roomIds }, status: { in: ['OPEN', 'REVIEWING'] } },
        select: { roomId: true, priority: true }
      }),
      this.prisma.report.findMany({
        where: { targetUserId: { in: hostIds }, status: { in: ['OPEN', 'REVIEWING'] } },
        select: { targetUserId: true, priority: true }
      })
    ]);

    const now = Date.now();
    const viewersByRoom = new Map<string, number>();
    const watchMsByRoom = new Map<string, number>();
    for (const p of participants) {
      viewersByRoom.set(p.roomId, (viewersByRoom.get(p.roomId) ?? 0) + 1);
      watchMsByRoom.set(p.roomId, (watchMsByRoom.get(p.roomId) ?? 0) + (now - p.joinedAt.getTime()));
    }
    const giftCoinsByRoom = new Map(gifts.map((g) => [g.roomId, g._sum.totalCoinAmount ?? 0]));
    const riskByRoom = new Map<string, number>();
    const addRisk = (key: string, p: ReportPriority) => riskByRoom.set(key, (riskByRoom.get(key) ?? 0) + REPORT_SEVERITY[p]);
    for (const r of roomReports) addRisk(`room:${r.roomId}`, r.priority);
    for (const r of hostReports) if (r.targetUserId) addRisk(`host:${r.targetUserId}`, r.priority);

    const ranked = rooms
      .map((room) => {
        const viewers = viewersByRoom.get(room.id) ?? 0;
        const avgWatchMinutes = viewers ? watchMsByRoom.get(room.id)! / viewers / 60_000 : 0;
        const creatorCreatedAt = (room as any).host?.creatorProfile?.createdAt as Date | undefined;
        const features: RoomFeatures = {
          activeViewers: viewers,
          avgWatchMinutes,
          giftCoinsPerMin: (giftCoinsByRoom.get(room.id) ?? 0) / GIFT_WINDOW_MINUTES,
          languageMatch: !!query.viewerLanguage && room.language === query.viewerLanguage,
          countryMatch: !!query.viewerCountry && room.country === query.viewerCountry,
          followsHost: false, // ponytail: public feed has no identity; add when an authed feed variant is justified
          creatorAgeDays: creatorCreatedAt ? (now - creatorCreatedAt.getTime()) / DAY_MS : null,
          reportRiskPoints: (riskByRoom.get(`room:${room.id}`) ?? 0) + (riskByRoom.get(`host:${room.hostUserId}`) ?? 0)
        };
        return { ...room, viewerCount: this.chat.countFor(room.id), ranking: scoreRoom(features) };
      })
      .sort((a, b) => b.ranking.score - a.ranking.score)
      .slice(0, RANK_RETURN);

    return ranked;
  }

  // Features for the trivial 0/1-room case (no aggregation needed).
  private emptyFeatures(room: any, query: { viewerLanguage?: string; viewerCountry?: string }): RoomFeatures {
    return {
      activeViewers: 0,
      avgWatchMinutes: 0,
      giftCoinsPerMin: 0,
      languageMatch: !!query.viewerLanguage && room.language === query.viewerLanguage,
      countryMatch: !!query.viewerCountry && room.country === query.viewerCountry,
      followsHost: false,
      creatorAgeDays: room.host?.creatorProfile?.createdAt
        ? (Date.now() - new Date(room.host.creatorProfile.createdAt).getTime()) / DAY_MS
        : null,
      reportRiskPoints: 0
    };
  }

  async get(id: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id }, include: PUBLIC_HOST_INCLUDE });
    return room && { ...room, viewerCount: this.chat.countFor(id) };
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

  // Admin force-end a room (regardless of host), with an audit trail.
  async adminEnd(actorId: string, roomId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    const updated = await this.prisma.liveRoom.update({ where: { id: roomId }, data: { status: RoomStatus.ENDED, endedAt: new Date() } });
    await this.prisma.adminAuditLog.create({ data: { actorId, action: 'room.ended', target: roomId, metadata: {} } });
    this.chat.emitToRoom(roomId, 'room.ended', { roomId, reason: 'ADMIN_ENDED' });
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

    if (ended.length) this.logger.warn(`Auto-ended ${ended.length} stale room(s): ${ended.join(', ')}`);
    return { ended, maxIdleMinutes };
  }
}
