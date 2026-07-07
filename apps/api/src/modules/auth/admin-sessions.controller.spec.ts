import { AdminSessionsController } from './admin-sessions.controller';

describe('AdminSessionsController', () => {
  it('delegates list/revoke/revoke-all with the acting admin id', async () => {
    const s: any = {
      adminListSessions: jest.fn().mockResolvedValue([]),
      adminRevokeSession: jest.fn().mockResolvedValue({ ok: true }),
      adminRevokeAllSessions: jest.fn().mockResolvedValue({ ok: true })
    };
    const c = new AdminSessionsController(s);
    await c.list('u1');
    await c.revoke({ sub: 'admin1' }, 'u1', 'sess1');
    await c.revokeAll({ sub: 'admin1' }, 'u1');
    expect(s.adminListSessions).toHaveBeenCalledWith('u1');
    expect(s.adminRevokeSession).toHaveBeenCalledWith('admin1', 'u1', 'sess1');
    expect(s.adminRevokeAllSessions).toHaveBeenCalledWith('admin1', 'u1');
  });
});
