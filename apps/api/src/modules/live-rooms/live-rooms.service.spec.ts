import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LiveRoomsService } from './live-rooms.service';

// Unit harness: every Prisma model the guarded methods touch, plus stubbed
// LiveKit + chat gateway so the error/throw branches stay unit-scoped.
function build() {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    creatorProfile: { findUnique: jest.fn() },
    liveRoom: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1', status: 'SCHEDULED' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'r1', title: 'Show', ...data }))
    },
    roomReminder: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn() },
    roomParticipant: { upsert: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const livekit: any = { createToken: jest.fn().mockResolvedValue('tok'), url: jest.fn().mockReturnValue('ws://lk') };
  const chat: any = { emitToRoom: jest.fn(), countFor: jest.fn().mockReturnValue(0) };
  const notifications: any = { notifyRoomLive: jest.fn().mockResolvedValue({ created: 0 }) };
  return { service: new LiveRoomsService(prisma, livekit, chat, notifications), prisma, livekit, chat, notifications };
}

const dto = { title: 'Friday Live', category: 'MUSIC', country: 'NG', language: 'pidgin' } as any;
const approvedCreator = { id: 'h1', role: 'CREATOR', status: 'ACTIVE' };

describe('LiveRoomsService.create (guards)', () => {
  it('rejects an inactive user', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', role: 'CREATOR', status: 'SUSPENDED' });
    await expect(service.create('h1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a non-creator role', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', role: 'VIEWER', status: 'ACTIVE' });
    await expect(service.create('h1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a creator who is not yet approved', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(approvedCreator);
    prisma.creatorProfile.findUnique.mockResolvedValue({ approvalStatus: 'PENDING' });
    await expect(service.create('h1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a creator who already has an active live room', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(approvedCreator);
    prisma.creatorProfile.findUnique.mockResolvedValue({ approvalStatus: 'APPROVED' });
    prisma.liveRoom.findFirst.mockResolvedValue({ id: 'already-live' });
    await expect(service.create('h1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a SCHEDULED room for an approved creator', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(approvedCreator);
    prisma.creatorProfile.findUnique.mockResolvedValue({ approvalStatus: 'APPROVED' });
    await service.create('h1', dto);
    expect(prisma.liveRoom.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hostUserId: 'h1', status: 'SCHEDULED' }) })
    );
  });

  it('lets an ADMIN create a room without an approved creator profile', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'a1', role: 'ADMIN', status: 'ACTIVE' });
    await service.create('a1', dto);
    expect(prisma.creatorProfile.findUnique).not.toHaveBeenCalled(); // admins bypass the beta gate
    expect(prisma.liveRoom.create).toHaveBeenCalled();
  });
});

describe('LiveRoomsService.setReminder (guards)', () => {
  it('throws NotFound for a missing room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.setReminder('u1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a reminder for a non-scheduled room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'LIVE' });
    await expect(service.setReminder('u1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts a reminder for a scheduled room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'SCHEDULED' });
    await expect(service.setReminder('u1', 'r1')).resolves.toEqual({ roomId: 'r1', reminded: true });
    expect(prisma.roomReminder.upsert).toHaveBeenCalled();
  });
});

describe('LiveRoomsService.start (guards + happy path)', () => {
  it('throws NotFound for a missing room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.start('h1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a non-host from starting', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'other', status: 'SCHEDULED' });
    await expect(service.start('h1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids starting when the host is no longer active', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'SCHEDULED' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'SUSPENDED' });
    await expect(service.start('h1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects starting a room that is already live', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'LIVE' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'ACTIVE' });
    await expect(service.start('h1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects starting from a terminal status (ENDED)', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'ENDED' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'ACTIVE' });
    await expect(service.start('h1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('goes live, routes the fan-out through the notifications service, and clears reminders', async () => {
    const { service, prisma, livekit, notifications } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'SCHEDULED', title: 'Show' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'ACTIVE' });
    prisma.roomReminder.findMany.mockResolvedValue([{ userId: 'rm1' }, { userId: 'f1' }]);

    const res = await service.start('h1', 'r1');

    expect(res).toMatchObject({ status: 'LIVE', hostToken: 'tok', livekitUrl: 'ws://lk' });
    // Fan-out is delegated so the CREATOR_LIVE opt-out + per-room throttle apply.
    expect(notifications.notifyRoomLive).toHaveBeenCalledWith('h1', 'r1', 'Show', ['rm1', 'f1']);
    expect(prisma.roomReminder.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'r1' } });
    expect(livekit.createToken).toHaveBeenCalledWith(expect.objectContaining({ canPublish: true }));
  });

  it('skips reminder cleanup when there were no reminders', async () => {
    const { service, prisma, notifications } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'SCHEDULED', title: 'Show' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'ACTIVE' });
    await service.start('h1', 'r1');
    expect(notifications.notifyRoomLive).toHaveBeenCalledWith('h1', 'r1', 'Show', []);
    expect(prisma.roomReminder.deleteMany).not.toHaveBeenCalled();
  });
});

describe('LiveRoomsService.end (guards)', () => {
  it('throws NotFound for a missing room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.end('h1', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a non-host from ending', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'other' });
    await expect(service.end('h1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ends the room and broadcasts room.ended', async () => {
    const { service, prisma, chat } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1' });
    const res = await service.end('h1', 'r1');
    expect(res).toMatchObject({ status: 'ENDED' });
    expect(chat.emitToRoom).toHaveBeenCalledWith('r1', 'room.ended', expect.objectContaining({ reason: 'HOST_ENDED' }));
  });
});

describe('LiveRoomsService.joinToken (guards)', () => {
  it('forbids an inactive user', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'v1', status: 'SUSPENDED' });
    await expect(service.joinToken('v1', 'r1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects joining a room that is not live', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'v1', status: 'ACTIVE' });
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'SCHEDULED', livekitRoomName: null });
    await expect(service.joinToken('v1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('issues a subscribe-only viewer token for a live room', async () => {
    const { service, prisma, livekit } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'v1', status: 'ACTIVE' });
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'LIVE', livekitRoomName: 'afristage-r1' });
    const res = await service.joinToken('v1', 'r1');
    expect(res).toMatchObject({ roomId: 'r1', viewerToken: 'tok', chatSocketPath: '/chat' });
    expect(prisma.roomParticipant.upsert).toHaveBeenCalled(); // dedup join row
    expect(livekit.createToken).toHaveBeenCalledWith(expect.objectContaining({ canPublish: false }));
  });
});

describe('LiveRoomsService.adminEnd', () => {
  it('throws NotFound for a missing room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.adminEnd('admin', 'r1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('force-ends a room with an audit log + broadcast', async () => {
    const { service, prisma, chat } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1' });
    const res = await service.adminEnd('admin', 'r1');
    expect(res).toMatchObject({ status: 'ENDED' });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'room.ended', actorId: 'admin' }) })
    );
    expect(chat.emitToRoom).toHaveBeenCalledWith('r1', 'room.ended', expect.objectContaining({ reason: 'ADMIN_ENDED' }));
  });
});

function buildFeed() {
  const prisma: any = {
    liveRoom: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    roomParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    chatMessage: { findFirst: jest.fn().mockResolvedValue(null) }
  };
  const livekit: any = { createToken: jest.fn(), url: jest.fn() };
  const chat: any = { countFor: jest.fn().mockReturnValue(0), emitToRoom: jest.fn() };
  const notifications: any = { notifyRoomLive: jest.fn().mockResolvedValue({ created: 0 }) };
  return { service: new LiveRoomsService(prisma, livekit, chat, notifications), prisma, chat };
}

const liveRoom = (over: any = {}) => ({
  id: 'r1', hostUserId: 'h1', status: 'LIVE', peakViewers: 5,
  language: 'pidgin', country: 'NG', startedAt: new Date(), createdAt: new Date(),
  host: { creatorProfile: { createdAt: new Date() } }, ...over
});

describe('LiveRoomsService.list (ranked feed)', () => {
  it('returns [] when nothing is live', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    expect(await service.list({})).toEqual([]);
  });

  it('takes the trivial path for a single room (text search + locale match)', async () => {
    const { service, prisma, chat } = buildFeed();
    chat.countFor.mockReturnValue(0); // -> peakViewers fallback
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom()]);
    const res = await service.list({ q: 'afro', viewerLanguage: 'pidgin', viewerCountry: 'NG' });
    expect(res).toHaveLength(1);
    expect(res[0].viewerCount).toBe(5); // peakViewers fallback
    expect(res[0].ranking).toBeDefined();
  });

  it('ranks multiple rooms using participants, gifts, and report risk', async () => {
    const { service, prisma, chat } = buildFeed();
    chat.countFor.mockImplementation((id: string) => (id === 'r1' ? 42 : 0)); // exercise both || arms
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1', hostUserId: 'h1' }),
      liveRoom({ id: 'r2', hostUserId: 'h2', host: { creatorProfile: null } }) // creatorAge null arm
    ]);
    prisma.roomParticipant.findMany.mockResolvedValue([
      { roomId: 'r1', joinedAt: new Date(Date.now() - 120_000) },
      { roomId: 'r1', joinedAt: new Date(Date.now() - 60_000) }
    ]);
    prisma.giftTransaction.groupBy.mockResolvedValue([{ roomId: 'r1', _sum: { totalCoinAmount: 300 } }]);
    prisma.report.findMany
      .mockResolvedValueOnce([{ roomId: 'r1', priority: 'HIGH' }]) // room reports
      .mockResolvedValueOnce([{ targetUserId: 'h2', priority: 'CRITICAL' }]); // host reports
    const res = await service.list({ viewerLanguage: 'pidgin', viewerCountry: 'NG' });
    expect(res).toHaveLength(2);
    expect(res[0].viewerCount).toBe(42); // chat.countFor left arm for r1
    expect(res.every((r: any) => r.ranking?.score !== undefined)).toBe(true);
  });
});

describe('LiveRoomsService.list feed cache (R5 §9 #3)', () => {
  afterEach(() => {
    delete process.env.FEED_CACHE_TTL_SECONDS;
    jest.restoreAllMocks();
  });

  it('serves the second request from cache but still personalizes per viewer', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1', country: 'NG' }),
      liveRoom({ id: 'r2', country: 'GH', hostUserId: 'h2' })
    ]);
    const first = await service.list({ viewerCountry: 'NG' });
    const second = await service.list({ viewerCountry: 'GH' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1); // slice cached
    // personalization applied per request over the SAME cached slice
    const ngBoost = first.find((r: any) => r.id === 'r1')!.ranking.components.countryMatch;
    const ghBoost = second.find((r: any) => r.id === 'r2')!.ranking.components.countryMatch;
    expect(ngBoost).toBeGreaterThan(0);
    expect(ghBoost).toBeGreaterThan(0);
    expect(second.find((r: any) => r.id === 'r1')!.ranking.components.countryMatch).toBe(0);
  });

  it('caches per (country,category) key and re-queries after the TTL lapses', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({ country: 'NG' });
    await service.list({ country: 'GH' }); // different key -> own query
    await service.list({ country: 'NG' }); // hit
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2);
    const realNow = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(realNow + 11_000); // past the 10s default TTL
    await service.list({ country: 'NG' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(3);
  });

  it('text search bypasses the cache and TTL=0 disables it', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({ q: 'afro' });
    await service.list({ q: 'afro' });
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2);
    process.env.FEED_CACHE_TTL_SECONDS = '0';
    await service.list({});
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(4);
  });

  it('a garbage TTL env falls back to the 10s default', async () => {
    process.env.FEED_CACHE_TTL_SECONDS = 'not-a-number';
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({});
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(1); // still cached
  });

  it('evicts the oldest key once the key space is full', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    for (let i = 0; i < 65; i++) await service.list({ country: `C${i}` }); // 64-key bound
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(65);
    await service.list({ country: 'C0' }); // was evicted as oldest -> fresh query
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(66);
    await service.list({ country: 'C64' }); // still cached
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(66);
  });

  it('rankSlice falls back to zero features for a room missing from the slice map', () => {
    const { service } = buildFeed();
    const ranked = (service as any).rankSlice({ rooms: [liveRoom()], features: new Map() }, {});
    expect(ranked[0].ranking.score).toBeDefined();
  });

  it('starting and ending a room invalidates the cached slice', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.list({});
    // simulate an end() (host + room stubs for the guard path)
    prisma.liveRoom.findUnique = jest.fn().mockResolvedValue({ id: 'r1', hostUserId: 'h1' });
    prisma.liveRoom.update.mockResolvedValue({ id: 'r1' });
    await service.end('h1', 'r1');
    await service.list({});
    expect(prisma.liveRoom.findMany).toHaveBeenCalledTimes(2); // cache was cleared
  });
});

describe('LiveRoomsService.endStaleRooms', () => {
  it('auto-ends rooms idle past the window, keeps active ones', async () => {
    const { service, prisma } = buildFeed();
    const old = new Date(Date.now() - 60 * 60_000); // 1h ago
    prisma.liveRoom.findMany.mockResolvedValue([
      { id: 'stale', startedAt: old, createdAt: old },
      { id: 'active', startedAt: new Date(), createdAt: new Date() }
    ]);
    // 'stale' has no chat/gift; 'active' has a recent chat
    prisma.chatMessage.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where.roomId === 'active' ? { createdAt: new Date() } : null));
    const res = await service.endStaleRooms(30);
    expect(res.ended).toEqual(['stale']);
    expect(prisma.liveRoom.update).toHaveBeenCalledTimes(1);
  });

  it('returns no rooms ended for an empty live set', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    expect(await service.endStaleRooms()).toMatchObject({ ended: [] });
  });

  it('uses createdAt as the activity floor when a room never started', async () => {
    const { service, prisma } = buildFeed();
    const old = new Date(Date.now() - 60 * 60_000);
    prisma.liveRoom.findMany.mockResolvedValue([{ id: 'never', startedAt: null, createdAt: old }]);
    const res = await service.endStaleRooms(30);
    expect(res.ended).toEqual(['never']);
  });
});

describe('LiveRoomsService.get', () => {
  it('returns the room with a live viewer count', async () => {
    const { service, prisma, chat } = buildFeed();
    prisma.liveRoom.findUnique = jest.fn().mockResolvedValue({ id: 'r1', peakViewers: 9 });
    chat.countFor.mockReturnValue(0); // peakViewers fallback
    expect(await service.get('r1')).toMatchObject({ id: 'r1', viewerCount: 9 });
  });

  it('returns null for a missing room', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findUnique = jest.fn().mockResolvedValue(null);
    expect(await service.get('gone')).toBeNull();
  });
});

describe('LiveRoomsService.list single-room creatorAge null arm', () => {
  it('handles a single room whose host has no creator profile', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([liveRoom({ host: { creatorProfile: null } })]);
    const res = await service.list({});
    expect(res).toHaveLength(1);
  });
});

describe('LiveRoomsService.upcoming + null gift sum', () => {
  it('upcoming falls back to the default page size for a zero limit', async () => {
    const { service, prisma } = buildFeed();
    await service.upcoming(0); // Math.trunc(0) || 50 -> 50
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    await service.upcoming(10);
    expect(prisma.liveRoom.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('coerces a null gift sum to zero in the ranking aggregation', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findMany.mockResolvedValue([
      liveRoom({ id: 'r1' }),
      liveRoom({ id: 'r2', hostUserId: 'h2' })
    ]);
    prisma.giftTransaction.groupBy.mockResolvedValue([{ roomId: 'r1', _sum: { totalCoinAmount: null } }]);
    const res = await service.list({});
    expect(res).toHaveLength(2);
  });
});

describe('LiveRoomsService.upcoming limit clamps', () => {
  it('clamps a negative limit up to 1 and a huge limit down to 100', async () => {
    const { service, prisma } = buildFeed();
    await service.upcoming(-3); // trunc(-3) is truthy -> max(-3,1) = 1
    expect(prisma.liveRoom.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 1 }));
    await service.upcoming(9999); // min(9999,100) = 100
    expect(prisma.liveRoom.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 100 }));
  });
});

describe('LiveRoomsService.upcoming default param', () => {
  it('defaults to 50 when called with no argument', async () => {
    const { service, prisma } = buildFeed();
    await service.upcoming();
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });
});
