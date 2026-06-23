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
