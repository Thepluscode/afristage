import { GiftsController } from './gifts.controller';
describe('GiftsController', () => {
  it('delegates every endpoint (limit defaults + explicit)', () => {
    const s = { list: jest.fn(), myGifts: jest.fn(), topGifters: jest.fn(), create: jest.fn(), update: jest.fn(), send: jest.fn() };
    const c = new GiftsController(s as any); const u = { sub: 'u1' };
    c.list(); c.myGifts(u, '5'); c.myGifts(u); c.topGifters('r1', '3'); c.topGifters('r1');
    c.create({ name: 'g' } as any); c.update('g1', { coinPrice: 1 } as any); c.send(u, 'r1', { giftId: 'g1' } as any);
    expect(s.myGifts).toHaveBeenNthCalledWith(1, 'u1', 5);
    expect(s.myGifts).toHaveBeenNthCalledWith(2, 'u1', 50);
    expect(s.topGifters).toHaveBeenNthCalledWith(2, 'r1', 10);
    expect(s.send).toHaveBeenCalledWith('u1', 'r1', expect.objectContaining({ giftId: 'g1' }));
  });
});
