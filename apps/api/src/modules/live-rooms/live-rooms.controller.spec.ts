import { LiveRoomsController } from './live-rooms.controller';
describe('LiveRoomsController', () => {
  it('delegates every endpoint (upcoming default + explicit)', () => {
    const s = { create: jest.fn(), start: jest.fn(), end: jest.fn(), list: jest.fn(), upcoming: jest.fn(), get: jest.fn(), joinToken: jest.fn(), setReminder: jest.fn(), cancelReminder: jest.fn() };
    const c = new LiveRoomsController(s as any); const u = { sub: 'u1' };
    c.create(u, { title: 't' } as any); c.start(u, 'r1'); c.end(u, 'r1');
    c.list('NG', 'MUSIC', 'pidgin', 'NG', 'q'); c.upcoming('20'); c.upcoming(); c.get('r1');
    c.join(u, 'r1'); c.setReminder(u, 'r1'); c.cancelReminder(u, 'r1');
    expect(s.list).toHaveBeenCalledWith(expect.objectContaining({ country: 'NG', q: 'q' }));
    expect(s.upcoming).toHaveBeenNthCalledWith(1, 20);
    expect(s.upcoming).toHaveBeenNthCalledWith(2, 50);
    expect(s.joinToken).toHaveBeenCalledWith('u1', 'r1');
  });
});
