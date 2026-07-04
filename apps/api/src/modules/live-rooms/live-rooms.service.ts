import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ReportPriority, RoomStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLiveRoomDto } from './dto/create-live-room.dto';
import { LiveKitService } from './livekit.service';
import { REPORT_SEVERITY, RoomFeatures, scoreRoom } from './ranking';

const RANK_CANDIDATE_POOL = 100; // rooms we score per request
const RANK_RETURN = 50;
const GIFT_WINDOW_MINUTES = 10; // recent window for gift-velocity
const DAY_MS = 86_400_000;

// Feed slice cache (R5 §9 #3). TTL in seconds via FEED_CACHE_TTL_SECONDS:
// default 10, clamped 0..300, 0 disables caching entirely (escape hatch).
const feedCacheTtlMs = () => {
  const s = Number(process.env.FEED_CACHE_TTL_SECONDS ?? 10);
  return (Number.isFinite(s) ? Math.min(Math.max(s, 0), 300) : 10) * 1000;
};
const FEED_CACHE_MAX_KEYS = 64; // bound the (country,category) key space

// Viewer-neutral room features — everything that does NOT depend on who asks.
type NeutralFeatures = Omit<RoomFeatures, 'languageMatch' | 'countryMatch' | 'followsHost'>;
interface FeedSlice {
  rooms: any[];
  features: Map<string, NeutralFeatures>;
}

// ponytail: never expose passwordHash/email/phone on a public host object. Safe fields only.
const PUBLIC_HOST_INCLUDE = {
  host: { select: { id: true, role: true, profile: true, creatorProfile: true } }
} as const;

@Injectable()
export class LiveRoomsService {
  private readonly logger = new Logger(LiveRoomsService.name);
  // key: `${country ?? '*'}:${category ?? '*'}` → cached feed slice
  private readonly feedCache = new Map<string, { at: number; slice: FeedSlice }>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly chat: ChatGateway,
    private readonly notifications: NotificationsService
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
    this.feedCache.clear(); // a room went live — don't serve a stale slice for up to a TTL
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
    this.feedCache.clear();
    this.chat.emitToRoom(roomId, 'room.ended', { roomId, reason: 'HOST_ENDED' });
    return updated;
  }

  // Ranked live feed. Explainable weighted score (see ranking.ts), not ML.
  // `country`/`category` stay hard filters; `viewerLanguage`/`viewerCountry` are
  // soft personalization boosts. Each returned room carries its `ranking`
  // breakdown so the feed order is auditable.
  //
  // R5 §9 #3: the expensive part (candidate query + 4 aggregations) is cached
  // per (country, category) for a short TTL. Viewer-specific boosts are applied
  // at request time over the cached slice, so personalization is never baked
  // into the cache. Text search bypasses the cache (long-tail keys).
  // ponytail: per-instance in-memory cache; move the slice to Redis when the
  // instance count makes N-cold-starts-per-TTL matter.
  async list(query: { country?: string; category?: any; viewerLanguage?: string; viewerCountry?: string; q?: string }) {
    const q = query.q?.trim();
    const ttl = feedCacheTtlMs();
    if (q || ttl === 0) return this.rankSlice(await this.loadFeedSlice(query, q), query);

    const key = `${query.country ?? '*'}:${query.category ?? '*'}`;
    const hit = this.feedCache.get(key);
    if (hit && Date.now() - hit.at < ttl) return this.rankSlice(hit.slice, query);

    const slice = await this.loadFeedSlice(query, undefined);
    if (this.feedCache.size >= FEED_CACHE_MAX_KEYS) {
      this.feedCache.delete(this.feedCache.keys().next().value as string); // drop oldest key
    }
    this.feedCache.set(key, { at: Date.now(), slice });
    return this.rankSlice(slice, query);
  }

  // The expensive half of the feed: candidate rooms + viewer/gift/report
  // aggregations, reduced to viewer-NEUTRAL features (no language/country
  // match — those depend on who is asking).
  private async loadFeedSlice(
    query: { country?: string; category?: any },
    q: string | undefined
  ): Promise<FeedSlice> {
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
    if (rooms.length <= 1) {
      // Trivial slice: no aggregation needed, neutral features are all zero.
      return { rooms, features: new Map(rooms.map((r) => [r.id, this.zeroFeatures(r)])) };
    }

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

    const features = new Map<string, NeutralFeatures>(
      rooms.map((room) => {
        const viewers = viewersByRoom.get(room.id) ?? 0;
        const avgWatchMinutes = viewers ? watchMsByRoom.get(room.id)! / viewers / 60_000 : 0;
        const creatorCreatedAt = (room as any).host?.creatorProfile?.createdAt as Date | undefined;
        return [
          room.id,
          {
            activeViewers: viewers,
            avgWatchMinutes,
            giftCoinsPerMin: (giftCoinsByRoom.get(room.id) ?? 0) / GIFT_WINDOW_MINUTES,
            creatorAgeDays: creatorCreatedAt ? (now - creatorCreatedAt.getTime()) / DAY_MS : null,
            reportRiskPoints:
              (riskByRoom.get(`room:${room.id}`) ?? 0) + (riskByRoom.get(`host:${room.hostUserId}`) ?? 0)
          }
        ];
      })
    );
    return { rooms, features };
  }

  // The cheap half: viewer-specific boosts + scoring + sort over a slice
  // (cached or fresh). viewerCount stays live — it never comes from the cache.
  private rankSlice(slice: FeedSlice, query: { viewerLanguage?: string; viewerCountry?: string }) {
    return slice.rooms
      .map((room) => {
        const neutral = slice.features.get(room.id) ?? this.zeroFeatures(room);
        const features: RoomFeatures = {
          ...neutral,
          languageMatch: !!query.viewerLanguage && room.language === query.viewerLanguage,
          countryMatch: !!query.viewerCountry && room.country === query.viewerCountry,
          followsHost: false // ponytail: public feed has no identity; add when an authed feed variant is justified
        };
        return { ...room, viewerCount: this.chat.countFor(room.id) || room.peakViewers, ranking: scoreRoom(features) };
      })
      .sort((a, b) => b.ranking.score - a.ranking.score)
      .slice(0, RANK_RETURN);
  }

  private zeroFeatures(room: any): NeutralFeatures {
    return {
      activeViewers: 0,
      avgWatchMinutes: 0,
      giftCoinsPerMin: 0,
      creatorAgeDays: room.host?.creatorProfile?.createdAt
        ? (Date.now() - new Date(room.host.creatorProfile.createdAt).getTime()) / DAY_MS
        : null,
      reportRiskPoints: 0
    };
  }

  async get(id: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id }, include: PUBLIC_HOST_INCLUDE });
    return room && { ...room, viewerCount: this.chat.countFor(id) || room.peakViewers };
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
    this.feedCache.clear();
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
