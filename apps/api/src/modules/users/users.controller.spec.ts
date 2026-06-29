import { UsersController } from './users.controller';
describe('UsersController', () => {
  it('delegates every endpoint', () => {
    const s = { me: jest.fn(), updateProfile: jest.fn(), follow: jest.fn(), unfollow: jest.fn(), listBlocked: jest.fn(), block: jest.fn(), unblock: jest.fn() };
    const c = new UsersController(s as any); const u = { sub: 'u1' };
    c.me(u); c.updateMe(u, { displayName: 'x' } as any); c.follow(u, 'b'); c.unfollow(u, 'b'); c.blocked(u); c.block(u, 'b'); c.unblock(u, 'b');
    expect(s.follow).toHaveBeenCalledWith('u1', 'b'); expect(s.unblock).toHaveBeenCalledWith('u1', 'b');
  });
});
