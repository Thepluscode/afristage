import { NotificationsService } from './notifications.service';

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

describe('NotificationsService delivery', () => {
  function rich() {
    const prisma: any = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'n1' }),
        createMany: jest.fn().mockResolvedValue({ count: 2 })
      },
      follow: { findMany: jest.fn().mockResolvedValue([]) }
    };
    return { svc: new NotificationsService(prisma), prisma };
  }

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

  it('notifyUser persists a single notification', async () => {
    const { svc, prisma } = rich();
    await svc.notifyUser('u1', 'NEW_FOLLOWER', 'Hi', 'body');
    expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', type: 'NEW_FOLLOWER' }) }));
  });

  it('notifyFollowersCreatorLive returns 0 when there are no followers', async () => {
    const { svc } = rich();
    expect(await svc.notifyFollowersCreatorLive('c1', 'r1', 'Show')).toEqual({ created: 0 });
  });

  it('notifyFollowersCreatorLive fans out to every follower', async () => {
    const { svc, prisma } = rich();
    prisma.follow.findMany.mockResolvedValue([{ followerId: 'f1' }, { followerId: 'f2' }]);
    expect(await svc.notifyFollowersCreatorLive('c1', 'r1', 'Show')).toEqual({ created: 2 });
    expect(prisma.notification.createMany).toHaveBeenCalled();
  });
});
