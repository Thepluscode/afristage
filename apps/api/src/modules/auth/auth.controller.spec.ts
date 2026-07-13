import { AuthController } from './auth.controller';
const svc = () => ({
  register: jest.fn().mockResolvedValue('r'),
  login: jest.fn().mockResolvedValue('l'),
  refresh: jest.fn().mockResolvedValue('rf'),
  logoutAll: jest.fn().mockResolvedValue('lo'),
  logout: jest.fn().mockResolvedValue('lg'),
  listSessions: jest.fn().mockResolvedValue([]),
  revokeSession: jest.fn().mockResolvedValue('rv'),
  setupMfa: jest.fn().mockResolvedValue('s'),
  enableMfa: jest.fn().mockResolvedValue('e'),
  confirmPasswordReset: jest.fn().mockResolvedValue({ ok: true })
});
const req = { ip: '1.2.3.4', headers: { 'user-agent': 'jest-agent' } };
describe('AuthController', () => {
  it('delegates every endpoint', async () => {
    const s = svc(); const c = new AuthController(s as any); const u = { sub: 'u1', sid: 'sess1' };
    await c.register({ a: 1 } as any, req); await c.login({ a: 1 } as any, req); await c.refresh({ refreshToken: 't' } as any, req);
    expect(c.me(u)).toBe(u); await c.logoutAll(u); await c.mfaSetup(u); await c.mfaEnable(u, 'tok');
    await c.sessions(u); await c.revokeSession(u, 'sess2'); await c.logout(u);
    await c.passwordResetConfirm({ token: 'rt', newPassword: 'NewPassw0rd!' } as any);
    expect(s.confirmPasswordReset).toHaveBeenCalledWith('rt', 'NewPassw0rd!');
    const meta = { ip: '1.2.3.4', userAgent: 'jest-agent' };
    expect(s.register).toHaveBeenCalledWith({ a: 1 }, meta);
    expect(s.login).toHaveBeenCalledWith({ a: 1 }, meta);
    expect(s.refresh).toHaveBeenCalledWith('t', meta);
    expect(s.logoutAll).toHaveBeenCalledWith('u1'); expect(s.enableMfa).toHaveBeenCalledWith('u1', 'tok');
    expect(s.listSessions).toHaveBeenCalledWith('u1', 'sess1');
    expect(s.revokeSession).toHaveBeenCalledWith('u1', 'sess2');
    expect(s.logout).toHaveBeenCalledWith('u1', 'sess1');
  });

  it('metaOf tolerates a request with no headers', async () => {
    const s = svc(); const c = new AuthController(s as any);
    await c.login({ a: 1 } as any, { ip: undefined, headers: undefined });
    expect(s.login).toHaveBeenCalledWith({ a: 1 }, { ip: undefined, userAgent: undefined });
  });
});
