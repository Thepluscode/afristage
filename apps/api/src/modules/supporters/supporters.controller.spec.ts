import { SupportersController } from './supporters.controller';
describe('SupportersController', () => {
  it('delegates circle and myStanding with parsed params', () => {
    const s = { circle: jest.fn(), myStanding: jest.fn() };
    const c = new SupportersController(s as any);
    c.circle('c1', '5');
    c.circle('c1');
    c.myStanding({ sub: 'v1' }, 'c1');
    expect(s.circle).toHaveBeenNthCalledWith(1, 'c1', 5);
    expect(s.circle).toHaveBeenNthCalledWith(2, 'c1', undefined);
    expect(s.myStanding).toHaveBeenCalledWith('c1', 'v1');
  });
});
