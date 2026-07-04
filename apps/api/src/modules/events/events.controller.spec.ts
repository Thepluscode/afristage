import { EventsController } from './events.controller';
describe('EventsController', () => {
  it('delegates every endpoint with parsed params', () => {
    const s = { listCurrent: jest.fn(), listAll: jest.fn(), leaderboard: jest.fn(), create: jest.fn(), update: jest.fn(), settle: jest.fn() };
    const c = new EventsController(s as any);
    c.listCurrent();
    c.leaderboard('e1', '5');
    c.leaderboard('e1');
    c.create({ name: 'N', startsAt: 'a', endsAt: 'b' } as any);
    c.update('e1', { name: 'M' } as any);
    expect(s.leaderboard).toHaveBeenNthCalledWith(1, 'e1', 5);
    expect(s.leaderboard).toHaveBeenNthCalledWith(2, 'e1', undefined);
    expect(s.create).toHaveBeenCalled();
    c.listAll();
    c.settle('e1');
    expect(s.update).toHaveBeenCalledWith('e1', { name: 'M' });
    expect(s.listAll).toHaveBeenCalled();
    expect(s.settle).toHaveBeenCalledWith('e1');
  });
});
