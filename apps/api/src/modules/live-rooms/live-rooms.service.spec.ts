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
  const chat: any = { emit: jest.fn(), viewerCount: jest.fn().mockReturnValue(0) };
  const notifications: any = { notifyRoomLive: jest.fn().mockResolvedValue({ created: 0 }) };
  const feed: any = { invalidate: jest.fn(), list: jest.fn().mockResolvedValue([]) };
  return { service: new LiveRoomsService(prisma, livekit, chat, chat, notifications, feed), prisma, livekit, chat, notifications, feed };
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
    expect(chat.emit).toHaveBeenCalledWith('r1', 'room.ended', expect.objectContaining({ reason: 'HOST_ENDED' }));
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
    expect(chat.emit).toHaveBeenCalledWith('r1', 'room.ended', expect.objectContaining({ reason: 'ADMIN_ENDED' }));
  });
});

// Local harness for the read/lifecycle describes below (the feed pipeline has
// its own spec — feed-engine.service.spec.ts).
function buildFeed() {
  const prisma: any = {
    liveRoom: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null) },
    roomParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    chatMessage: { findFirst: jest.fn().mockResolvedValue(null) }
  };
  const livekit: any = { createToken: jest.fn(), url: jest.fn() };
  const chat: any = { viewerCount: jest.fn().mockReturnValue(0), emit: jest.fn() };
  const notifications: any = { notifyRoomLive: jest.fn().mockResolvedValue({ created: 0 }) };
  const feed: any = { invalidate: jest.fn(), list: jest.fn().mockResolvedValue([]) };
  return { service: new LiveRoomsService(prisma, livekit, chat, chat, notifications, feed), prisma, chat, feed };
}

const liveRoom = (over: any = {}) => ({
  id: 'r1', hostUserId: 'h1', status: 'LIVE', peakViewers: 5,
  language: 'pidgin', country: 'NG', startedAt: new Date(), createdAt: new Date(),
  host: { creatorProfile: { createdAt: new Date() } }, ...over
});

describe('LiveRoomsService.list delegation', () => {
  it('hands the feed read straight to the FeedEngine', async () => {
    const { service, feed } = buildFeed();
    feed.list.mockResolvedValue([{ id: 'r1' }]);
    await expect(service.list({ country: 'NG' })).resolves.toEqual([{ id: 'r1' }]);
    expect(feed.list).toHaveBeenCalledWith({ country: 'NG' });
  });

  it('start/end and the stale sweep invalidate the feed', async () => {
    const { service, prisma, feed } = buildFeed();
    prisma.liveRoom.findUnique = jest.fn().mockResolvedValue({ id: 'r1', hostUserId: 'h1' });
    prisma.liveRoom.update.mockResolvedValue({ id: 'r1' });
    await service.end('h1', 'r1');
    expect(feed.invalidate).toHaveBeenCalledTimes(1);
    // stale sweep: one LIVE room with ancient activity gets ended -> invalidate
    prisma.liveRoom.findMany.mockResolvedValue([
      { id: 'r9', status: 'LIVE', startedAt: new Date(0), createdAt: new Date(0) }
    ]);
    await service.endStaleRooms(1);
    expect(feed.invalidate).toHaveBeenCalledTimes(2);
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
    chat.viewerCount.mockReturnValue(0); // peakViewers fallback
    expect(await service.get('r1')).toMatchObject({ id: 'r1', viewerCount: 9 });
  });

  it('returns null for a missing room', async () => {
    const { service, prisma } = buildFeed();
    prisma.liveRoom.findUnique = jest.fn().mockResolvedValue(null);
    expect(await service.get('gone')).toBeNull();
  });
});

describe('LiveRoomsService.upcoming page size', () => {
  it('upcoming falls back to the default page size for a zero limit', async () => {
    const { service, prisma } = buildFeed();
    await service.upcoming(0); // Math.trunc(0) || 50 -> 50
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    await service.upcoming(10);
    expect(prisma.liveRoom.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 10 }));
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
