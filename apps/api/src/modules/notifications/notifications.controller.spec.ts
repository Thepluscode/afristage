import { NotificationsController } from './notifications.controller';
describe('NotificationsController', () => {
  it('delegates every endpoint', () => {
    const s = { mine: jest.fn(), unreadCount: jest.fn(), markAllRead: jest.fn(), markRead: jest.fn(), preferences: jest.fn(), setPreference: jest.fn() };
    const c = new NotificationsController(s as any); const u = { sub: 'u1' };
    c.mine(u); c.unreadCount(u); c.markAllRead(u); c.markRead(u, 'n1');
    c.preferences(u); c.setPreference(u, { type: 'CREATOR_LIVE', enabled: false });
    expect(s.markRead).toHaveBeenCalledWith('u1', 'n1');
    expect(s.preferences).toHaveBeenCalledWith('u1');
    expect(s.setPreference).toHaveBeenCalledWith('u1', 'CREATOR_LIVE', false);
  });
});
