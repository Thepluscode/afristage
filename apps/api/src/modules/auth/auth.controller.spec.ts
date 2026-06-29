import { AuthController } from './auth.controller';
const svc = () => ({ register: jest.fn().mockResolvedValue('r'), login: jest.fn().mockResolvedValue('l'), refresh: jest.fn().mockResolvedValue('rf'), logoutAll: jest.fn().mockResolvedValue('lo'), setupMfa: jest.fn().mockResolvedValue('s'), enableMfa: jest.fn().mockResolvedValue('e') });
describe('AuthController', () => {
  it('delegates every endpoint', async () => {
    const s = svc(); const c = new AuthController(s as any); const u = { sub: 'u1' };
    await c.register({ a: 1 } as any); await c.login({ a: 1 } as any); await c.refresh({ refreshToken: 't' } as any);
    expect(c.me(u)).toBe(u); await c.logoutAll(u); await c.mfaSetup(u); await c.mfaEnable(u, 'tok');
    expect(s.register).toHaveBeenCalled(); expect(s.refresh).toHaveBeenCalledWith('t');
    expect(s.logoutAll).toHaveBeenCalledWith('u1'); expect(s.enableMfa).toHaveBeenCalledWith('u1', 'tok');
  });
});
