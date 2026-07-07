import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LiveRoomsService } from './live-rooms.service';

function build() {
  const prisma: any = {
    liveRoom: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
    roomReminder: { upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
    follow: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    user: { findUnique: jest.fn() }
  };
  const livekit: any = { createToken: jest.fn().mockResolvedValue('tok'), url: jest.fn().mockReturnValue('ws://lk') };
  const notifications: any = { notifyRoomLive: jest.fn().mockResolvedValue({ created: 0 }) };
  const service = new LiveRoomsService(prisma, livekit, {} as any, notifications, { invalidate: jest.fn() } as any);
  return { service, prisma, notifications };
}

describe('LiveRoomsService.upcoming', () => {
  it('queries SCHEDULED rooms with a future start, soonest first', async () => {
    const { service, prisma } = build();
    await service.upcoming(20);
    const arg = prisma.liveRoom.findMany.mock.calls[0][0];
    expect(arg.where.status).toBe('SCHEDULED');
    expect(arg.where.scheduledStartAt.gte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ scheduledStartAt: 'asc' });
    expect(arg.take).toBe(20);
  });

  it('bounds the limit to 1..100', async () => {
    const { service, prisma } = build();
    await service.upcoming(9999);
    expect(prisma.liveRoom.findMany.mock.calls[0][0].take).toBe(100);
    await service.upcoming(0); // 0 -> default 50
    expect(prisma.liveRoom.findMany.mock.calls[1][0].take).toBe(50);
  });
});

describe('LiveRoomsService reminders', () => {
  it('sets a reminder for a scheduled room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'SCHEDULED' });
    expect(await service.setReminder('u1', 'r1')).toEqual({ roomId: 'r1', reminded: true });
    expect(prisma.roomReminder.upsert).toHaveBeenCalled();
  });

  it('rejects a reminder for a non-scheduled (already live/ended) room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', status: 'LIVE' });
    await expect(service.setReminder('u1', 'r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a reminder for a missing room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.setReminder('u1', 'gone')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancel is idempotent', async () => {
    const { service, prisma } = build();
    expect(await service.cancelReminder('u1', 'r1')).toEqual({ roomId: 'r1', reminded: false });
    expect(prisma.roomReminder.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'r1', userId: 'u1' } });
  });
});

describe('LiveRoomsService.start notifications', () => {
  function startCtx() {
    const ctx = build();
    const { prisma } = ctx;
    prisma.liveRoom.findUnique.mockResolvedValue({ id: 'r1', hostUserId: 'host', status: 'SCHEDULED' });
    prisma.liveRoom.update.mockResolvedValue({ id: 'r1', title: 'My Show', hostUserId: 'host' });
    prisma.user.findUnique.mockResolvedValue({ id: 'host', status: 'ACTIVE' });
    return ctx;
  }

  it('routes the go-live fan-out through the notifications service with the reminder holders', async () => {
    // Dedup, host-exclusion, opt-outs and throttling live in NotificationsService.notifyRoomLive
    // (covered by its own spec) — start() just delegates with the reminder list.
    const { service, prisma, notifications } = startCtx();
    prisma.roomReminder.findMany.mockResolvedValue([{ userId: 'b' }, { userId: 'c' }, { userId: 'host' }]);
    await service.start('host', 'r1');
    expect(notifications.notifyRoomLive).toHaveBeenCalledWith('host', 'r1', 'My Show', ['b', 'c', 'host']);
  });

  it('clears the fired reminders after start', async () => {
    const { service, prisma } = startCtx();
    prisma.roomReminder.findMany.mockResolvedValue([{ userId: 'c' }]);
    await service.start('host', 'r1');
    expect(prisma.roomReminder.deleteMany).toHaveBeenCalledWith({ where: { roomId: 'r1' } });
  });
});
