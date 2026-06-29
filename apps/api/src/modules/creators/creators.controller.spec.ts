import { CreatorsController } from './creators.controller';
describe('CreatorsController', () => {
  it('delegates every endpoint (myRooms limit default + explicit)', () => {
    const s = { apply: jest.fn(), getMe: jest.fn(), dashboard: jest.fn(), myRooms: jest.fn(), getPublic: jest.fn() };
    const c = new CreatorsController(s as any); const u = { sub: 'u1' };
    c.apply(u, { stageName: 'x' } as any); c.me(u); c.dashboard(u); c.myRooms(u, '10'); c.myRooms(u); c.get(u, 'c1');
    expect(s.myRooms).toHaveBeenNthCalledWith(1, 'u1', 10);
    expect(s.myRooms).toHaveBeenNthCalledWith(2, 'u1', 50);
    expect(s.getPublic).toHaveBeenCalledWith('c1', 'u1');
  });
});
