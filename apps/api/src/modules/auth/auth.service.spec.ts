import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { AuthService } from './auth.service';

// Richer harness for register/login/MFA, which touch more of Prisma + wallet
// than the refresh-only `build()` above.
function buildAuth() {
  const prisma: any = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({})
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('signed.jwt.token'), verify: jest.fn() };
  const wallet: any = { ensureUserWallets: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(prisma, jwt, wallet);
  return { service, prisma, jwt, wallet };
}

describe('AuthService.register (guards)', () => {
  it('rejects when neither email nor phone is provided', async () => {
    const { service } = buildAuth();
    await expect(
      service.register({ ageConfirmed: true, password: 'pw' } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when age is not confirmed', async () => {
    const { service } = buildAuth();
    await expect(
      service.register({ email: 'a@b.c', ageConfirmed: false, password: 'pw' } as any)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates the user, provisions wallets, and issues tokens on success', async () => {
    const { service, prisma, wallet } = buildAuth();
    prisma.user.create.mockResolvedValue({ id: 'u1', role: 'VIEWER', email: 'a@b.c', tokenVersion: 0 });
    const res = await service.register({
      email: 'a@b.c', ageConfirmed: true, password: 'pw',
      username: 'u', displayName: 'U', country: 'NG', language: 'pidgin'
    } as any);
    expect(wallet.ensureUserWallets).toHaveBeenCalledWith('u1', 'COIN');
    expect(res).toMatchObject({ userId: 'u1', role: 'VIEWER' });
  });
});

describe('AuthService.login (error paths)', () => {
  it('rejects an unknown identifier', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.login({ identifier: 'ghost@a.c', password: 'pw' } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong password', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4)
    });
    await expect(
      service.login({ identifier: 'a@b.c', password: 'wrong' } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive account even with a correct password', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'SUSPENDED', passwordHash: await bcrypt.hash('right', 4)
    });
    await expect(
      service.login({ identifier: 'a@b.c', password: 'right' } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('blocks seeded accounts in production', async () => {
    const { service } = buildAuth();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(
        service.login({ identifier: 'admin@afristage.local', password: 'x' } as any)
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('requires an MFA token when MFA is enabled', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4),
      mfaEnabled: true, mfaSecret: authenticator.generateSecret(), mfaRecoveryCodes: []
    });
    await expect(
      service.login({ identifier: 'a@b.c', password: 'right' } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid MFA token', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4),
      mfaEnabled: true, mfaSecret: authenticator.generateSecret(), mfaRecoveryCodes: []
    });
    await expect(
      service.login({ identifier: 'a@b.c', password: 'right', mfaToken: '000000' } as any)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('consumes a one-time recovery code when MFA is enabled', async () => {
    const { service, prisma } = buildAuth();
    const recovery = 'recovery01';
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4),
      mfaEnabled: true, mfaSecret: authenticator.generateSecret(),
      mfaRecoveryCodes: [await bcrypt.hash(recovery, 4)]
    });
    const res = await service.login({ identifier: 'a@b.c', password: 'right', mfaToken: recovery } as any);
    expect(res).toMatchObject({ userId: 'u1' });
    expect(prisma.user.update).toHaveBeenCalled(); // recovery code burned
  });
});

describe('AuthService MFA setup/enable', () => {
  it('setupMfa returns a secret + otpauth URL', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', email: 'a@b.c', profile: { username: 'u' } });
    const res = await service.setupMfa('u1');
    expect(res.secret).toEqual(expect.any(String));
    expect(res.otpauthUrl).toContain('otpauth://');
  });

  it('enableMfa requires setup first when there is no secret', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', mfaSecret: null });
    await expect(service.enableMfa('u1', '123456')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enableMfa rejects an invalid confirmation token', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', mfaSecret: authenticator.generateSecret() });
    await expect(service.enableMfa('u1', '000000')).rejects.toBeInstanceOf(BadRequestException);
  });
});

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
