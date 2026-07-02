import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_TYPES } from './notification-types';

function build() {
  const prisma: any = {
    notification: { count: jest.fn(), updateMany: jest.fn() }
  };
  return { svc: new NotificationsService(prisma), prisma };
}

describe('NotificationsService read-state', () => {
  it('unreadCount counts only this user\'s unread notifications', async () => {
    const { svc, prisma } = build();
    prisma.notification.count.mockResolvedValue(3);
    expect(await svc.unreadCount('me')).toEqual({ count: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'me', readAt: null } });
  });

  it('markAllRead updates only this user\'s unread notifications and returns the count', async () => {
    const { svc, prisma } = build();
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    expect(await svc.markAllRead('me')).toEqual({ ok: true, count: 5 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'me', readAt: null },
      data: { readAt: expect.any(Date) }
    });
  });
});

// Full mock surface for delivery/preferences: opt-out lookups + throttle counts.
function rich() {
  const prisma: any = {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'n1' }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      count: jest.fn().mockResolvedValue(0)
    },
    notificationPreference: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({})
    },
    follow: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { svc: new NotificationsService(prisma), prisma };
}

describe('NotificationsService delivery', () => {
  it('mine lists the latest notifications for a user', async () => {
    const { svc, prisma } = rich();
    await svc.mine('me');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'me' }, take: 50 }));
  });

  it('markRead is scoped to the owner', async () => {
    const { svc, prisma } = rich();
    expect(await svc.markRead('me', 'n1')).toEqual({ ok: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'n1', userId: 'me' } }));
  });

  it('notifyUser persists a registered type (NEW_FOLLOWER has no throttle)', async () => {
    const { svc, prisma } = rich();
    await svc.notifyUser('u1', 'NEW_FOLLOWER', 'Hi', 'body');
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', type: 'NEW_FOLLOWER' }) })
    );
    expect(prisma.notification.count).not.toHaveBeenCalled(); // throttleMinutes 0 -> no window query
  });

  it('notifyUser rejects a type outside the taxonomy', async () => {
    const { svc, prisma } = rich();
    await expect(svc.notifyUser('u1', 'MADE_UP_TYPE', 'x', 'y')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyUser suppresses a type the user opted out of', async () => {
    const { svc, prisma } = rich();
    prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false });
    expect(await svc.notifyUser('u1', 'GIFT_RECOGNITION', 'x', 'y', 'r1')).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyUser suppresses inside the throttle window, scoped to the room', async () => {
    const { svc, prisma } = rich();
    prisma.notification.count.mockResolvedValue(1); // already pinged in-window
    expect(await svc.notifyUser('u1', 'GIFT_RECOGNITION', 'x', 'y', 'r1')).toBeNull();
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: 'u1', type: 'GIFT_RECOGNITION', roomId: 'r1', createdAt: { gte: expect.any(Date) } })
    });
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('notifyUser delivers a throttled type when the window is clear (no roomId scope)', async () => {
    const { svc, prisma } = rich();
    await svc.notifyUser('u1', 'GIFT_RECOGNITION', 'x', 'y'); // no roomId
    const where = prisma.notification.count.mock.calls[0][0].where;
    expect(where.roomId).toBeUndefined();
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  it('notifyUser ignores preferences for transactional types (PAYOUT_UPDATE)', async () => {
    const { svc, prisma } = rich();
    prisma.notificationPreference.findUnique.mockResolvedValue({ enabled: false }); // would suppress if consulted
    await svc.notifyUser('u1', 'PAYOUT_UPDATE', 'Paid', 'body');
    expect(prisma.notificationPreference.findUnique).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalled();
  });
});

describe('NotificationsService preferences', () => {
  it('lists the full taxonomy with defaults and merges stored opt-outs', async () => {
    const { svc, prisma } = rich();
    prisma.notificationPreference.findMany.mockResolvedValue([{ type: 'CREATOR_LIVE', enabled: false }]);
    const prefs = await svc.preferences('u1');
    expect(prefs.map((p) => p.type).sort()).toEqual(Object.keys(NOTIFICATION_TYPES).sort());
    expect(prefs.find((p) => p.type === 'CREATOR_LIVE')).toMatchObject({ enabled: false, optOut: true });
    expect(prefs.find((p) => p.type === 'NEW_FOLLOWER')).toMatchObject({ enabled: true }); // default
    expect(prefs.find((p) => p.type === 'PAYOUT_UPDATE')).toMatchObject({ enabled: true, optOut: false }); // always on
  });

  it('setPreference upserts an opt-out for a registered type', async () => {
    const { svc, prisma } = rich();
    expect(await svc.setPreference('u1', 'CREATOR_LIVE', false)).toEqual({ ok: true, type: 'CREATOR_LIVE', enabled: false });
    expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'u1', type: 'CREATOR_LIVE' } },
      create: { userId: 'u1', type: 'CREATOR_LIVE', enabled: false },
      update: { enabled: false }
    });
  });

  it('setPreference rejects unknown types and non-opt-out types', async () => {
    const { svc } = rich();
    await expect(svc.setPreference('u1', 'NOPE', false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.setPreference('u1', 'PAYOUT_UPDATE', false)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('NotificationsService room-live fan-out', () => {
  it('returns 0 when there are no followers or reminders', async () => {
    const { svc } = rich();
    expect(await svc.notifyRoomLive('c1', 'r1', 'Show')).toEqual({ created: 0 });
  });

  it('fans out to every follower when none opted out or were recently pinged', async () => {
    const { svc, prisma } = rich();
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }, { followerId: 'f2' }]);
    expect(await svc.notifyRoomLive('c1', 'r1', 'Show')).toEqual({ created: 2 });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([expect.objectContaining({ userId: 'f1', type: 'CREATOR_LIVE', roomId: 'r1' })])
    });
  });

  it('skips opted-out followers and anyone already pinged for this room', async () => {
    const { svc, prisma } = rich();
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }, { followerId: 'f2' }, { followerId: 'f3' }]);
    prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'f1' }]); // f1 opted out
    prisma.notification.findMany.mockResolvedValue([{ userId: 'f2' }]); // f2 pinged in-window
    expect(await svc.notifyRoomLive('c1', 'r1', 'Show')).toEqual({ created: 1 });
    const data = prisma.notification.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0].userId).toBe('f3');
  });

  it('reminder-setters are notified even when opted out of CREATOR_LIVE, deduped against followers, never the host', async () => {
    const { svc, prisma } = rich();
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }]);
    // f1 (follower) AND rem1 (reminder) opted out — the reminder overrides the opt-out.
    prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'f1' }, { userId: 'rem1' }]);
    const res = await svc.notifyRoomLive('c1', 'r1', 'Show', ['rem1', 'rem1', 'f1', 'c1']);
    expect(res).toEqual({ created: 2 }); // rem1 (explicit) + f1 (kept: also an explicit reminder); host excluded
    const ids = prisma.notification.createMany.mock.calls[0][0].data.map((d: any) => d.userId).sort();
    expect(ids).toEqual(['f1', 'rem1']);
  });

  it('throttles reminder-setters already pinged for this room', async () => {
    const { svc, prisma } = rich();
    prisma.notification.findMany.mockResolvedValue([{ userId: 'rem1' }]); // pinged in-window
    expect(await svc.notifyRoomLive('c1', 'r1', 'Show', ['rem1'])).toEqual({ created: 0 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('returns 0 without writing when everyone is filtered out', async () => {
    const { svc, prisma } = rich();
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }]);
    prisma.notificationPreference.findMany.mockResolvedValue([{ userId: 'f1' }]);
    expect(await svc.notifyRoomLive('c1', 'r1', 'Show')).toEqual({ created: 0 });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
