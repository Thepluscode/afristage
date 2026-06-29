import { PayoutsController } from './payouts.controller';
describe('PayoutsController', () => {
  it('delegates every endpoint (default reject reason)', () => {
    const s = { request: jest.fn(), mine: jest.fn(), listMethods: jest.fn(), createMethod: jest.fn(), deleteMethod: jest.fn(), adminList: jest.fn(), hold: jest.fn(), release: jest.fn(), approve: jest.fn(), reject: jest.fn(), markPaid: jest.fn() };
    const c = new PayoutsController(s as any); const u = { sub: 'u1' };
    c.request(u, { coinAmount: 500 } as any); c.mine(u); c.methods(u); c.addMethod(u, { provider: 'BANK' } as any); c.removeMethod(u, 'm1');
    c.adminList('UNDER_REVIEW'); c.hold(u, 'p1', 'r'); c.release(u, 'p1'); c.approve(u, 'p1');
    c.reject(u, 'p1'); c.reject(u, 'p1', 'bad'); c.markPaid(u, 'p1', 'ref');
    expect(s.reject).toHaveBeenNthCalledWith(1, 'u1', 'p1', 'Rejected');
    expect(s.markPaid).toHaveBeenCalledWith('u1', 'p1', 'ref');
  });
});
