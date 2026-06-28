import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';

function build() {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', status: 'ACTIVE' }) },
    liveRoom: { findUnique: jest.fn().mockResolvedValue({ id: 'r1', status: 'LIVE', hostUserId: 'host' }) },
    roomMute: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    chatMessage: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', ...data })),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([])
    },
    moderationAction: { create: jest.fn().mockResolvedValue({}) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  return { service: new ChatService(prisma), prisma };
}

const host = { sub: 'host', role: 'CREATOR' as any };
const admin = { sub: 'mod', role: 'ADMIN' as any };
const viewer = { sub: 'v1', role: 'VIEWER' as any };

describe('ChatService.createMessage', () => {
  it('rejects an empty or oversized message', async () => {
    const { service } = build();
    await expect(service.createMessage('u1', 'r1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createMessage('u1', 'r1', 'x'.repeat(501))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids an inactive (banned/suspended) sender', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 'BANNED' });
    await expect(service.createMessage('u1', 'r1', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects sending to a room that is not live', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'SCHEDULED' });
    await expect(service.createMessage('u1', 'r1', 'hi')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids a currently-muted sender', async () => {
    const { service, prisma } = build();
    prisma.roomMute.findUnique.mockResolvedValue({ mutedUntil: new Date(Date.now() + 60_000) });
    await expect(service.createMessage('u1', 'r1', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores an expired mute and sends', async () => {
    const { service, prisma } = build();
    prisma.roomMute.findUnique.mockResolvedValue({ mutedUntil: new Date(Date.now() - 60_000) });
    await expect(service.createMessage('u1', 'r1', 'hi')).resolves.toMatchObject({ message: 'hi' });
  });

  it('persists a valid message', async () => {
    const { service, prisma } = build();
    await service.createMessage('u1', 'r1', 'hello room');
    expect(prisma.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roomId: 'r1', senderId: 'u1', message: 'hello room' }) })
    );
  });

  it('enforces the per-user rate limit within the window', async () => {
    const prev = process.env.CHAT_RATE_LIMIT;
    process.env.CHAT_RATE_LIMIT = '2';
    try {
      const { service } = build();
      await service.createMessage('u1', 'r1', 'one');
      await service.createMessage('u1', 'r1', 'two');
      await expect(service.createMessage('u1', 'r1', 'three')).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      if (prev === undefined) delete process.env.CHAT_RATE_LIMIT;
      else process.env.CHAT_RATE_LIMIT = prev;
    }
  });
});

describe('ChatService moderation (assertCanModerate)', () => {
  it('throws NotFound when the room does not exist', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.mute(host, 'r1', 'v1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a non-host non-privileged actor', async () => {
    const { service } = build(); // room host is 'host', actor is a plain viewer
    await expect(service.mute(viewer, 'r1', 'v2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets the room host mute (upsert + moderation action + audit)', async () => {
    const { service, prisma } = build();
    const res = await service.mute(host, 'r1', 'v1', 300, 'spam');
    expect(res).toMatchObject({ roomId: 'r1', userId: 'v1', durationSeconds: 300 });
    expect(prisma.roomMute.upsert).toHaveBeenCalled();
    expect(prisma.moderationAction.create).toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
  });

  it('lets a privileged admin mute even when not the host', async () => {
    const { service, prisma } = build();
    await service.mute(admin, 'r1', 'v1');
    expect(prisma.roomMute.upsert).toHaveBeenCalled();
  });

  it('unmute clears the mute row', async () => {
    const { service, prisma } = build();
    await expect(service.unmute(host, 'r1', 'v1')).resolves.toEqual({ roomId: 'r1', userId: 'v1', muted: false });
    expect(prisma.roomMute.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'r1', userId: 'v1' } });
  });
});

describe('ChatService.deleteMessage', () => {
  it('throws NotFound when the message is missing or in another room', async () => {
    const { service, prisma } = build();
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    await expect(service.deleteMessage(host, 'r1', 'm1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.chatMessage.findUnique.mockResolvedValue({ id: 'm1', roomId: 'OTHER' });
    await expect(service.deleteMessage(host, 'r1', 'm1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a message for a permitted moderator', async () => {
    const { service, prisma } = build();
    prisma.chatMessage.findUnique.mockResolvedValue({ id: 'm1', roomId: 'r1' });
    const res = await service.deleteMessage(host, 'r1', 'm1');
    expect(res.status).toBe('HIDDEN_BY_MODERATOR');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'HIDDEN_BY_MODERATOR' } })
    );
  });
});

describe('ChatService.listMessages', () => {
  it('returns only VISIBLE messages, oldest first, bounded', async () => {
    const { service, prisma } = build();
    await service.listMessages('r1');
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roomId: 'r1', status: 'VISIBLE' }, take: 200 })
    );
  });
});
