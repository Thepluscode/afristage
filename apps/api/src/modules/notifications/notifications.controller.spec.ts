import { NotificationsController } from './notifications.controller';
describe('NotificationsController', () => {
  it('delegates every endpoint', () => {
    const s = { mine: jest.fn(), unreadCount: jest.fn(), markAllRead: jest.fn(), markRead: jest.fn() };
    const c = new NotificationsController(s as any); const u = { sub: 'u1' };
    c.mine(u); c.unreadCount(u); c.markAllRead(u); c.markRead(u, 'n1');
    expect(s.markRead).toHaveBeenCalledWith('u1', 'n1');
  });
});
