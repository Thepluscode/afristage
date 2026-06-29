import { BetaController } from './beta.controller';
describe('BetaController', () => {
  it('delegates every endpoint (invite type default + explicit)', () => {
    const s = { create: jest.fn(), list: jest.fn(), listRequests: jest.fn(), inviteFromRequest: jest.fn(), revoke: jest.fn(), accept: jest.fn() };
    const c = new BetaController(s as any); const u = { sub: 'a1' };
    c.create(u, { email: 'x' } as any); c.list(); c.requests('PENDING');
    c.inviteFromRequest(u, 'r1'); c.inviteFromRequest(u, 'r1', 'CREATOR' as any);
    c.revoke('i1'); c.accept(u, { code: 'abc' } as any);
    expect(s.inviteFromRequest).toHaveBeenNthCalledWith(1, 'a1', 'r1', undefined);
    expect(s.accept).toHaveBeenCalledWith('a1', 'abc');
  });
});
