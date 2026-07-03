import { MissionsController } from './missions.controller';
describe('MissionsController', () => {
  it('delegates every endpoint', () => {
    const s = { board: jest.fn(), claim: jest.fn(), promoStatus: jest.fn(), fund: jest.fn() };
    const c = new MissionsController(s as any);
    const u = { sub: 'u1' };
    c.board(u);
    c.claim(u, 'GIFT_1');
    c.promoStatus();
    c.fund({ sub: 'admin1' }, { coins: 500 });
    expect(s.board).toHaveBeenCalledWith('u1');
    expect(s.claim).toHaveBeenCalledWith('u1', 'GIFT_1');
    expect(s.promoStatus).toHaveBeenCalled();
    expect(s.fund).toHaveBeenCalledWith('admin1', 500);
  });
});
