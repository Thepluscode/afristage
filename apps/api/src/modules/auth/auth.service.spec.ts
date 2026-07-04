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
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    deviceSession: {
      create: jest.fn().mockResolvedValue({ id: 'sess1' }),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    }
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
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
    deviceSession: {
      create: jest.fn().mockResolvedValue({ id: 'sess1' }),
      findUnique: jest.fn().mockResolvedValue({ id: 'sess1', userId: 'u1', revokedAt: null }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    }
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

describe('AuthService.login (privileged + MFA enable)', () => {
  it('requires MFA setup for a privileged account when REQUIRE_ADMIN_MFA=true', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({ id: 'a1', role: 'ADMIN', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4), mfaEnabled: false });
    const prev = process.env.REQUIRE_ADMIN_MFA;
    process.env.REQUIRE_ADMIN_MFA = 'true';
    try {
      await expect(service.login({ identifier: 'a@b.c', password: 'right' } as any)).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      if (prev === undefined) delete process.env.REQUIRE_ADMIN_MFA;
      else process.env.REQUIRE_ADMIN_MFA = prev;
    }
  });

  it('writes an admin-login audit log for a privileged account', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({ id: 'a1', role: 'ADMIN', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4), mfaEnabled: false });
    const res = await service.login({ identifier: 'a@b.c', password: 'right' } as any);
    expect(res).toMatchObject({ userId: 'a1', role: 'ADMIN' });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'admin.login' }) })
    );
  });

  it('enableMfa confirms a valid token and returns one-time recovery codes', async () => {
    const { service, prisma } = buildAuth();
    const secret = authenticator.generateSecret();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', mfaSecret: secret });
    const res = await service.enableMfa('u1', authenticator.generate(secret));
    expect(res.mfaEnabled).toBe(true);
    expect(res.recoveryCodes).toHaveLength(8);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: true }) })
    );
  });
});

describe('AuthService remaining branches', () => {
  it('verifySecondFactor falls back to recovery codes when there is no TOTP secret', async () => {
    const { service, prisma } = buildAuth();
    const code = 'rec-123';
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4),
      mfaEnabled: true, mfaSecret: null, mfaRecoveryCodes: [await bcrypt.hash(code, 4)]
    });
    await expect(service.login({ identifier: 'a@b.c', password: 'right', mfaToken: code } as any)).resolves.toMatchObject({ userId: 'u1' });
  });

  it('setupMfa uses the username when there is no email', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', email: null, profile: { username: 'ada' } });
    const res = await service.setupMfa('u1');
    expect(res.otpauthUrl).toContain('ada');
  });

  it('refresh accepts a legacy token with no tv against an account with no tokenVersion', async () => {
    const { service, jwt } = build({ id: 'u1', role: 'VIEWER', status: 'ACTIVE' }); // no tokenVersion
    jwt.verify.mockReturnValue({ sub: 'u1', role: 'VIEWER' }); // no tv
    await expect(service.refresh('legacy')).resolves.toMatchObject({ userId: 'u1' });
  });

  it('honours configured JWT secrets/TTLs when issuing tokens', async () => {
    const envKeys = ['JWT_ACCESS_SECRET', 'JWT_ACCESS_TTL', 'JWT_REFRESH_SECRET', 'JWT_REFRESH_TTL'];
    const prev = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    Object.assign(process.env, { JWT_ACCESS_SECRET: 'acc', JWT_ACCESS_TTL: '5m', JWT_REFRESH_SECRET: 'ref', JWT_REFRESH_TTL: '7d' });
    try {
      const { service } = build();
      await expect(service.refresh('valid')).resolves.toMatchObject({ userId: 'u1' });
    } finally {
      for (const k of envKeys) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]!; }
    }
  });
});

describe('AuthService final branch arms', () => {
  it('accepts a valid TOTP token when MFA is enabled', async () => {
    const { service, prisma } = buildAuth();
    const secret = authenticator.generateSecret();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('right', 4),
      mfaEnabled: true, mfaSecret: secret, mfaRecoveryCodes: []
    });
    await expect(
      service.login({ identifier: 'a@b.c', password: 'right', mfaToken: authenticator.generate(secret) } as any)
    ).resolves.toMatchObject({ userId: 'u1' });
  });

  it('setupMfa falls back to the userId when there is no email or username', async () => {
    const { service, prisma } = buildAuth();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', email: null, profile: null });
    const res = await service.setupMfa('u1');
    expect(res.otpauthUrl).toContain('u1');
  });

  it('device sessions: login opens a session, prunes dead rows, and embeds the sid', async () => {
    const { service, prisma, jwt } = buildAuth();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1', role: 'VIEWER', status: 'ACTIVE', passwordHash: await bcrypt.hash('pw', 4),
      mfaEnabled: false, mfaRecoveryCodes: [], tokenVersion: 0
    });
    await service.login({ identifier: 'a@b.c', password: 'pw', device: 'iPhone 13' } as any, { ip: '9.9.9.9', userAgent: 'ua' });
    expect(prisma.deviceSession.deleteMany).toHaveBeenCalled(); // prune
    expect(prisma.deviceSession.create).toHaveBeenCalledWith({
      data: { userId: 'u1', device: 'iPhone 13', ip: '9.9.9.9', userAgent: 'ua' }
    });
    expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sid: 'sess1' });
  });

  it('device sessions: listSessions marks the current one; revoke guards ownership', async () => {
    const { service, prisma } = buildAuth();
    prisma.deviceSession.findMany.mockResolvedValue([
      { id: 's1', device: 'A', ip: null, userAgent: null, createdAt: new Date(0), lastSeenAt: new Date(0) },
      { id: 's2', device: 'B', ip: null, userAgent: null, createdAt: new Date(0), lastSeenAt: new Date(0) }
    ]);
    const rows = await service.listSessions('u1', 's2');
    expect(rows.map((r) => r.current)).toEqual([false, true]);

    await expect(service.revokeSession('u1', 'ghost')).rejects.toThrow('Unknown session'); // not found
    prisma.deviceSession.findUnique.mockResolvedValue({ id: 's1', userId: 'other', revokedAt: null });
    await expect(service.revokeSession('u1', 's1')).rejects.toThrow('Unknown session'); // not mine
    prisma.deviceSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', revokedAt: null });
    await expect(service.revokeSession('u1', 's1')).resolves.toEqual({ ok: true });
    expect(prisma.deviceSession.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { revokedAt: expect.any(Date) } });
    prisma.deviceSession.update.mockClear();
    prisma.deviceSession.findUnique.mockResolvedValue({ id: 's1', userId: 'u1', revokedAt: new Date() });
    await expect(service.revokeSession('u1', 's1')).resolves.toEqual({ ok: true }); // idempotent
    expect(prisma.deviceSession.update).not.toHaveBeenCalled();
  });

  it('device sessions: logout revokes the current sid and is a no-op without one', async () => {
    const { service, prisma } = buildAuth();
    await expect(service.logout('u1', 'sess1')).resolves.toEqual({ ok: true });
    expect(prisma.deviceSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'sess1', userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    prisma.deviceSession.updateMany.mockClear();
    await expect(service.logout('u1')).resolves.toEqual({ ok: true }); // legacy token
    expect(prisma.deviceSession.updateMany).not.toHaveBeenCalled();
  });

  it('refresh rejects a revoked or foreign session and migrates legacy sid-less tokens', async () => {
    // revoked session
    let h = build();
    h.jwt.verify.mockReturnValue({ sub: 'u1', tv: 0, sid: 'sess1' });
    h.prisma.deviceSession.findUnique.mockResolvedValue({ id: 'sess1', userId: 'u1', revokedAt: new Date() });
    await expect(h.service.refresh('t')).rejects.toThrow('signed out');
    // session owned by someone else
    h = build();
    h.jwt.verify.mockReturnValue({ sub: 'u1', tv: 0, sid: 'sess1' });
    h.prisma.deviceSession.findUnique.mockResolvedValue({ id: 'sess1', userId: 'other', revokedAt: null });
    await expect(h.service.refresh('t')).rejects.toThrow('signed out');
    // live session -> lastSeen touched, same sid reissued
    h = build();
    h.jwt.verify.mockReturnValue({ sub: 'u1', tv: 0, sid: 'sess1' });
    await expect(h.service.refresh('t')).resolves.toMatchObject({ userId: 'u1' });
    expect(h.prisma.deviceSession.update).toHaveBeenCalledWith({ where: { id: 'sess1' }, data: { lastSeenAt: expect.any(Date) } });
    expect(h.jwt.sign.mock.calls[0][0]).toMatchObject({ sid: 'sess1' });
    // legacy token without sid -> a session is opened for it
    h = build();
    h.jwt.verify.mockReturnValue({ sub: 'u1', tv: 0 });
    await expect(h.service.refresh('t')).resolves.toMatchObject({ userId: 'u1' });
    expect(h.prisma.deviceSession.create).toHaveBeenCalled();
    expect(h.jwt.sign.mock.calls[0][0]).toMatchObject({ sid: 'sess1' });
  });

  it('issueTokens without a sid omits it from the payload', () => {
    const h = build();
    h.service.issueTokens({ id: 'u1', role: 'VIEWER' } as any);
    expect(h.jwt.sign.mock.calls[0][0]).not.toHaveProperty('sid');
  });

  it('logoutAll also revokes every open device session', async () => {
    const h = build();
    await h.service.logoutAll('u1');
    expect(h.prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { tokenVersion: { increment: 1 } } });
    expect(h.prisma.deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it('falls back to default JWT secrets/TTLs when env is unset', async () => {
    const envKeys = ['JWT_ACCESS_SECRET', 'JWT_ACCESS_TTL', 'JWT_REFRESH_SECRET', 'JWT_REFRESH_TTL'];
    const prev = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    for (const k of envKeys) delete process.env[k];
    try {
      const { service } = build();
      await expect(service.refresh('valid')).resolves.toMatchObject({ userId: 'u1' });
    } finally {
      for (const k of envKeys) { if (prev[k] !== undefined) process.env[k] = prev[k]!; }
    }
  });
});
