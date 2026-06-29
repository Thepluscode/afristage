import { ModerationController } from './moderation.controller';
describe('ModerationController', () => {
  it('delegates every endpoint', () => {
    const s = { report: jest.fn(), reports: jest.fn(), action: jest.fn(), suspendUser: jest.fn(), banUser: jest.fn(), reactivateUser: jest.fn(), suspendRoom: jest.fn() };
    const c = new ModerationController(s as any); const u = { sub: 'm1', role: 'ADMIN' };
    c.report(u, { reason: 'SPAM' } as any); c.reports('OPEN', 'HIGH', 'SPAM'); c.action(u, 'rep1', { action: 'DISMISS', reason: 'x' });
    c.suspendUser(u, 'v1', 'r'); c.banUser(u, 'v1', 'r'); c.reactivateUser(u, 'v1'); c.suspendRoom(u, 'rm1', 'r');
    expect(s.action).toHaveBeenCalledWith('m1', 'rep1', 'DISMISS', 'x');
    expect(s.suspendUser).toHaveBeenCalledWith('m1', 'v1', 'r', 'ADMIN');
  });
});
