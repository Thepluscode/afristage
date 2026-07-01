import { AdminController } from './admin.controller';
describe('AdminController', () => {
  function make() {
    const admin = { betaOpsDashboard: jest.fn(), dashboard: jest.fn(), users: jest.fn(), search: jest.fn(), creators: jest.fn(), liveRooms: jest.fn(), payments: jest.fn(), ledgerTransactions: jest.fn(), auditLogs: jest.fn() };
    const creators = { approveCreator: jest.fn(), rejectCreator: jest.fn(), suspendCreator: jest.fn() };
    const ledger = { check: jest.fn() };
    const rooms = { endStaleRooms: jest.fn(), get: jest.fn(), adminEnd: jest.fn() };
    return { c: new AdminController(admin as any, creators as any, ledger as any, rooms as any), admin, creators, ledger, rooms };
  }
  const u = { sub: 'a1' };
  it('delegates the admin read endpoints', () => {
    const { c, admin, ledger, rooms } = make();
    c.betaOps(); c.ledgerIntegrityCheck(); c.dashboard(); c.users('q', 'ACTIVE', 'ADMIN'); c.search('ada'); c.creators('APPROVED');
    c.liveRooms('LIVE'); c.liveRoom('r1'); c.payments(); c.ledgerTransactions(); c.auditLogs(); c.endStaleRooms(15);
    expect(admin.betaOpsDashboard).toHaveBeenCalled(); expect(ledger.check).toHaveBeenCalled(); expect(rooms.get).toHaveBeenCalledWith('r1');
    expect(admin.search).toHaveBeenCalledWith('ada');
  });
  it('delegates creator + room moderation with default reasons', () => {
    const { c, creators, rooms } = make();
    c.approveCreator(u, 'c1'); c.rejectCreator(u, 'c1'); c.rejectCreator(u, 'c1', 'bad');
    c.suspendCreator(u, 'c1'); c.suspendCreator(u, 'c1', 'tos'); c.endRoom(u, 'r1');
    expect(creators.rejectCreator).toHaveBeenNthCalledWith(1, 'a1', 'c1', 'Rejected');
    expect(creators.suspendCreator).toHaveBeenNthCalledWith(1, 'a1', 'c1', 'Suspended');
    expect(rooms.adminEnd).toHaveBeenCalledWith('a1', 'r1');
  });
});
