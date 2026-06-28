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
  return { service: new LiveRoomsService(prisma, livekit, chat), prisma, livekit, chat };
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

  it('goes live, notifies followers + reminder holders, and clears reminders', async () => {
    const { service, prisma, livekit } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'h1', status: 'SCHEDULED', title: 'Show' });
    prisma.user.findUnique.mockResolvedValue({ id: 'h1', status: 'ACTIVE' });
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }, { followerId: 'h1' }]); // host filtered out
    prisma.roomReminder.findMany.mockResolvedValue([{ userId: 'rm1' }, { userId: 'f1' }]); // f1 deduped

    const res = await service.start('h1', 'r1');

    expect(res).toMatchObject({ status: 'LIVE', hostToken: 'tok', livekitUrl: 'ws://lk' });
    const recipients = prisma.notification.createMany.mock.calls[0][0].data.map((d: any) => d.userId).sort();
    expect(recipients).toEqual(['f1', 'rm1']); // host excluded, f1 not duplicated
    expect(prisma.roomReminder.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'r1' } });
    expect(livekit.createToken).toHaveBeenCalledWith(expect.objectContaining({ canPublish: true }));
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
