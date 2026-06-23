import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function build(user: any = { id: 'u1', role: 'VIEWER', status: 'ACTIVE', email: 'v@a.live', tokenVersion: 0 }) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) }
  };
  const jwt: any = {
    verify: jest.fn().mockReturnValue({ sub: 'u1', role: 'VIEWER', email: 'v@a.live', tv: 0 }),
    sign: jest.fn().mockReturnValue('signed.jwt.token')
  };
  const service = new AuthService(prisma, jwt, {} as any);
  return { service, prisma, jwt };
}

describe('AuthService.refresh', () => {
  it('issues a fresh token pair for a valid refresh token + active user', async () => {
    const { service, jwt } = build();
    const res = await service.refresh('valid-refresh-token');
    expect(res).toMatchObject({ userId: 'u1', role: 'VIEWER', accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(jwt.verify).toHaveBeenCalledWith('valid-refresh-token', expect.objectContaining({ secret: expect.any(String) }));
  });

  it('rejects an unverifiable refresh token', async () => {
    const { service, jwt } = build();
    jwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });
    await expect(service.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh for a suspended user', async () => {
    const { service } = build({ id: 'u1', role: 'VIEWER', status: 'SUSPENDED' });
    await expect(service.refresh('valid-but-suspended')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh for a deleted/missing user', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.refresh('valid-but-gone')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a refresh token issued before "sign out everywhere" (tv mismatch)', async () => {
    const { service, jwt } = build({ id: 'u1', role: 'VIEWER', status: 'ACTIVE', tokenVersion: 2 });
    jwt.verify.mockReturnValue({ sub: 'u1', role: 'VIEWER', tv: 1 }); // stale token
    await expect(service.refresh('stale')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logoutAll bumps the token version, invalidating existing refresh tokens', async () => {
    const { service, prisma } = build();
    expect(await service.logoutAll('u1')).toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { tokenVersion: { increment: 1 } } });
  });
});
