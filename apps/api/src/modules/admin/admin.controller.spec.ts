import { AdminController } from './admin.controller';
describe('AdminController', () => {
  function make() {
    const admin = { betaOpsDashboard: jest.fn(), dashboard: jest.fn(), users: jest.fn(), userActivity: jest.fn(), search: jest.fn(), creators: jest.fn(), liveRooms: jest.fn(), payments: jest.fn(), ledgerTransactions: jest.fn(), auditLogs: jest.fn(), leaderboard: jest.fn() };
    const account = { softDelete: jest.fn(), hardDelete: jest.fn(), export: jest.fn(), purgeExpired: jest.fn() };
    const creators = { approveCreator: jest.fn(), rejectCreator: jest.fn(), suspendCreator: jest.fn() };
    const ledger = { check: jest.fn() };
    const rooms = { endStaleRooms: jest.fn(), get: jest.fn(), adminEnd: jest.fn() };
    return { c: new AdminController(admin as any, account as any, creators as any, ledger as any, rooms as any), admin, account, creators, ledger, rooms };
  }
  const u = { sub: 'a1' };
  it('delegates the admin read endpoints', () => {
    const { c, admin, ledger, rooms } = make();
    c.betaOps(); c.ledgerIntegrityCheck(); c.dashboard(); c.users('q', 'ACTIVE', 'ADMIN'); c.userActivity('14'); c.userActivity(); c.search('ada'); c.creators('APPROVED');
    c.liveRooms('LIVE'); c.liveRoom('r1'); c.payments(); c.ledgerTransactions(); c.auditLogs(); c.endStaleRooms(15);
    expect(admin.betaOpsDashboard).toHaveBeenCalled(); expect(ledger.check).toHaveBeenCalled(); expect(rooms.get).toHaveBeenCalledWith('r1');
    expect(admin.search).toHaveBeenCalledWith('ada');
    expect(admin.userActivity).toHaveBeenNthCalledWith(1, 14);
    expect(admin.userActivity).toHaveBeenNthCalledWith(2, undefined);
  });

  it('delegates leaderboard with parsed limit and undefined defaults', () => {
    const { c, admin } = make();
    c.leaderboard('creator', 'day', '5');
    c.leaderboard();
    expect(admin.leaderboard).toHaveBeenNthCalledWith(1, 'creator', 'day', 5);
    expect(admin.leaderboard).toHaveBeenNthCalledWith(2, undefined, undefined, undefined);
  });
  it('delegates creator + room moderation with default reasons', () => {
    const { c, creators, rooms } = make();
    c.approveCreator(u, 'c1'); c.rejectCreator(u, 'c1'); c.rejectCreator(u, 'c1', 'bad');
    c.suspendCreator(u, 'c1'); c.suspendCreator(u, 'c1', 'tos'); c.endRoom(u, 'r1');
    expect(creators.rejectCreator).toHaveBeenNthCalledWith(1, 'a1', 'c1', 'Rejected');
    expect(creators.suspendCreator).toHaveBeenNthCalledWith(1, 'a1', 'c1', 'Suspended');
    expect(rooms.adminEnd).toHaveBeenCalledWith('a1', 'r1');
  });
  it('delegates account deletion endpoints with the acting admin id', () => {
    const { c, account } = make();
    c.softDeleteUser(u, 'x1'); c.purgeUser(u, 'x1'); c.exportUser('x1'); c.purgeExpired();
    expect(account.softDelete).toHaveBeenCalledWith('x1', 'a1');
    expect(account.hardDelete).toHaveBeenCalledWith('x1', 'a1');
    expect(account.export).toHaveBeenCalledWith('x1');
    expect(account.purgeExpired).toHaveBeenCalled();
  });
});
