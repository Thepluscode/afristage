import { CirclesController } from './circles.controller';
describe('CirclesController', () => {
  function make() {
    const s = {
      create: jest.fn(), list: jest.fn(), mine: jest.fn(), leaderboard: jest.fn(),
      detail: jest.fn(), join: jest.fn(), leave: jest.fn(),
      memberIds: jest.fn().mockResolvedValue(['u1', 'u2'])
    };
    const fraud = { assessGroup: jest.fn().mockResolvedValue({ riskScore: 0 }) };
    return { c: new CirclesController(s as any, fraud as any), s, fraud };
  }
  const u = { sub: 'u1' };

  it('delegates every endpoint with parsed params', () => {
    const { c, s } = make();
    c.create(u, { name: 'N' } as any);
    c.list('5'); c.list(undefined);
    c.mine(u);
    c.leaderboard('all', '3'); c.leaderboard(undefined, undefined);
    c.detail('ci1');
    c.join(u, 'ci1');
    c.leave(u);
    expect(s.create).toHaveBeenCalledWith('u1', { name: 'N' });
    expect(s.list).toHaveBeenNthCalledWith(1, 5);
    expect(s.list).toHaveBeenNthCalledWith(2, undefined);
    expect(s.leaderboard).toHaveBeenNthCalledWith(1, 'all', 3);
    expect(s.leaderboard).toHaveBeenNthCalledWith(2, undefined, undefined);
    expect(s.join).toHaveBeenCalledWith('u1', 'ci1');
    expect(s.leave).toHaveBeenCalledWith('u1');
  });

  it('assess feeds the circle membership into the group fraud scorer', async () => {
    const { c, s, fraud } = make();
    await c.assess('ci1');
    expect(s.memberIds).toHaveBeenCalledWith('ci1');
    expect(fraud.assessGroup).toHaveBeenCalledWith(['u1', 'u2']);
  });
});
