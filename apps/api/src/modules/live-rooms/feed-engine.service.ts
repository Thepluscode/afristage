import { Injectable } from '@nestjs/common';
import { Prisma, ReportPriority, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RoomPresence } from '../chat/room-events';
import { PUBLIC_HOST_INCLUDE } from './public-host';
import { REPORT_SEVERITY, RoomFeatures, scoreRoom } from './ranking';

// The ranked live feed as ONE deep module (architecture candidate #3): the
// candidate query, the four feature aggregations, the per-(country,category)
// slice cache, and the per-viewer scoring all live here. Room lifecycle code
// (and moderation) interacts with the feed through exactly two methods:
// list() to read it, invalidate() when room visibility changes.
//
// R5 §9 #3: the expensive half (candidate query + aggregations) is cached for
// a short TTL; viewer-specific boosts are applied at request time over the
// cached slice, so personalization is never baked into the cache. Text search
// bypasses the cache (long-tail keys).
// ponytail: per-instance in-memory cache; move the slice to Redis when the
// instance count makes N-cold-starts-per-TTL matter.

const RANK_CANDIDATE_POOL = 100; // rooms we score per request
const RANK_RETURN = 50;
const GIFT_WINDOW_MINUTES = 10; // recent window for gift-velocity
const DAY_MS = 86_400_000;

// TTL in seconds via FEED_CACHE_TTL_SECONDS: default 10, clamped 0..300,
// 0 disables caching entirely (escape hatch).
const feedCacheTtlMs = () => {
  const s = Number(process.env.FEED_CACHE_TTL_SECONDS ?? 10);
  return (Number.isFinite(s) ? Math.min(Math.max(s, 0), 300) : 10) * 1000;
};
const FEED_CACHE_MAX_KEYS = 64; // bound the (country,category) key space

// A candidate room with its safe public host payload — the shape everything
// in the feed pipeline (and the API response) carries.
export type FeedRoom = Prisma.LiveRoomGetPayload<{ include: typeof PUBLIC_HOST_INCLUDE }>;

// Viewer-neutral room features — everything that does NOT depend on who asks.
type NeutralFeatures = Omit<RoomFeatures, 'languageMatch' | 'countryMatch' | 'followsHost'>;
interface FeedSlice {
  rooms: FeedRoom[];
  features: Map<string, NeutralFeatures>;
}

export interface FeedQuery {
  country?: string;
  category?: any;
  viewerLanguage?: string;
  viewerCountry?: string;
  q?: string;
}

@Injectable()
export class FeedEngine {
  // key: `${country ?? '*'}:${category ?? '*'}` → cached feed slice
  private readonly cache = new Map<string, { at: number; slice: FeedSlice }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RoomPresence
  ) {}

  // Room visibility changed (start/end/suspend/stale-sweep): never serve a
  // stale slice for up to a TTL.
  invalidate() {
    this.cache.clear();
  }

  // Ranked live feed. Explainable weighted score (see ranking.ts), not ML.
  // `country`/`category` stay hard filters; `viewerLanguage`/`viewerCountry`
  // are soft personalization boosts. Each returned room carries its `ranking`
  // breakdown so the feed order is auditable.
  async list(query: FeedQuery) {
    const q = query.q?.trim();
    const ttl = feedCacheTtlMs();
    if (q || ttl === 0) return this.rankSlice(await this.loadFeedSlice(query, q), query);

    const key = `${query.country ?? '*'}:${query.category ?? '*'}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return this.rankSlice(hit.slice, query);

    const slice = await this.loadFeedSlice(query, undefined);
    if (this.cache.size >= FEED_CACHE_MAX_KEYS) {
      this.cache.delete(this.cache.keys().next().value as string); // drop oldest key
    }
    this.cache.set(key, { at: Date.now(), slice });
    return this.rankSlice(slice, query);
  }

  // The expensive half of the feed: candidate rooms + viewer/gift/report
  // aggregations, reduced to viewer-NEUTRAL features (no language/country
  // match — those depend on who is asking).
  private async loadFeedSlice(
    query: { country?: string; category?: any },
    q: string | undefined
  ): Promise<FeedSlice> {
    const rooms: FeedRoom[] = await this.prisma.liveRoom.findMany({
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
        const creatorCreatedAt = room.host?.creatorProfile?.createdAt;
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
        return { ...room, viewerCount: this.presence.viewerCount(room.id) || room.peakViewers, ranking: scoreRoom(features) };
      })
      .sort((a, b) => b.ranking.score - a.ranking.score)
      .slice(0, RANK_RETURN);
  }

  private zeroFeatures(room: FeedRoom): NeutralFeatures {
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
}
