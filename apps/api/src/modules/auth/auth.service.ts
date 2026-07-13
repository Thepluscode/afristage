import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../../database/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// Accept the adjacent 30s steps (±1) when verifying TOTP. Tolerates real-world
// clock skew between the user's device and the server, and removes a window-
// boundary race where a just-generated code lands in the next step on verify.
authenticator.options = { window: 1 };

const PRIVILEGED_ROLES: UserRole[] = [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER];

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}
const SEEDED_PRODUCTION_IDENTIFIERS = new Set([
  'admin@afristage.local',
  'viewer@afristage.local',
  'creator@afristage.local'
]);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wallet: WalletService
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta = {}) {
    if (!dto.email && !dto.phone) throw new BadRequestException('Email or phone is required');
    if (!dto.ageConfirmed) throw new BadRequestException('Age confirmation is required');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        ageConfirmed: dto.ageConfirmed,
        role: UserRole.VIEWER,
        profile: {
          create: {
            username: dto.username,
            displayName: dto.displayName,
            country: dto.country,
            language: dto.language
          }
        }
      },
      include: { profile: true }
    });

    await this.wallet.ensureUserWallets(user.id, 'COIN');
    return this.issueTokens(user, await this.openSession(user.id, dto.device, meta));
  }

  async login(dto: LoginDto, meta: SessionMeta = {}) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_SEEDED_PROD_LOGIN !== 'true' &&
      SEEDED_PRODUCTION_IDENTIFIERS.has(dto.identifier.toLowerCase())
    ) {
      throw new UnauthorizedException('Seeded test accounts are disabled in production');
    }

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.identifier }, { phone: dto.identifier }] },
      // password + MFA secrets are globally omitted (see PrismaService); opt back in to verify.
      omit: { passwordHash: false, mfaSecret: false, mfaRecoveryCodes: false }
    });
    if (!user?.passwordHash) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('User is not active');

    const privileged = PRIVILEGED_ROLES.includes(user.role);

    // Optionally force privileged accounts to have MFA set up before they can log in.
    if (privileged && !user.mfaEnabled && process.env.REQUIRE_ADMIN_MFA === 'true') {
      throw new UnauthorizedException('MFA setup required for this account');
    }

    if (user.mfaEnabled) {
      await this.verifySecondFactor(user.id, user.mfaSecret, user.mfaRecoveryCodes, dto.mfaToken);
    }

    if (privileged) {
      await this.prisma.adminAuditLog.create({ data: { actorId: user.id, action: 'admin.login', target: user.id, metadata: { role: user.role } } });
    }
    return this.issueTokens(user, await this.openSession(user.id, dto.device, meta));
  }

  // One row per signed-in device (R5 §9 #6). Also prunes dead rows so the
  // table can't grow without bound: revoked >30d ago or idle >60d.
  private async openSession(userId: string, device: string | undefined, meta: SessionMeta) {
    const now = Date.now();
    await this.prisma.deviceSession.deleteMany({
      where: {
        userId,
        OR: [
          { revokedAt: { lt: new Date(now - 30 * 86_400_000) } },
          { lastSeenAt: { lt: new Date(now - 60 * 86_400_000) } }
        ]
      }
    });
    const session = await this.prisma.deviceSession.create({
      data: { userId, device: device ?? null, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null }
    });
    return session.id;
  }

  // Active devices for the caller, newest activity first. `current` marks the
  // session behind the access token making this request.
  async listSessions(userId: string, currentSid?: string) {
    const rows = await this.prisma.deviceSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' }
    });
    return rows.map((s) => ({
      id: s.id,
      device: s.device,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      current: s.id === currentSid
    }));
  }

  // Revoke ONE device: its refresh token dies on next use. The device's access
  // token still runs out its short TTL — same bound the tokenVersion path has.
  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.deviceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new BadRequestException('Unknown session');
    if (!session.revokedAt) {
      await this.prisma.deviceSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  // ---- Admin session controls (security ops counterpart of the user's own
  // device list): view any account's active devices, force one out, or force
  // them all out. Every action lands in the admin audit log.

  async adminListSessions(userId: string) {
    const rows = await this.prisma.deviceSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' }
    });
    return rows.map((s) => ({
      id: s.id,
      device: s.device,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt
    }));
  }

  async adminRevokeSession(actorId: string, userId: string, sessionId: string) {
    const session = await this.prisma.deviceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new BadRequestException('Unknown session for this user');
    if (!session.revokedAt) {
      await this.prisma.deviceSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'user.session_revoked', target: userId, metadata: { sessionId, device: session.device } }
    });
    return { ok: true };
  }

  async adminRevokeAllSessions(actorId: string, userId: string) {
    await this.logoutAll(userId); // tokenVersion bump + sweep every session row
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'user.sessions_revoked_all', target: userId, metadata: {} }
    });
    return { ok: true };
  }

  // Sign out THIS device (no-op for legacy tokens that carry no sid).
  async logout(userId: string, sid?: string) {
    if (sid) {
      await this.prisma.deviceSession.updateMany({
        where: { id: sid, userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }
    return { ok: true };
  }

  // Accept a valid TOTP code, or consume a one-time recovery code.
  private async verifySecondFactor(userId: string, secret: string | null, recoveryCodes: string[], token?: string) {
    if (!token) throw new UnauthorizedException('MFA token required');
    if (secret && authenticator.verify({ token, secret })) return;

    for (const hash of recoveryCodes) {
      if (await bcrypt.compare(token, hash)) {
        await this.prisma.user.update({ where: { id: userId }, data: { mfaRecoveryCodes: recoveryCodes.filter((c) => c !== hash) } });
        return;
      }
    }
    throw new UnauthorizedException('Invalid MFA token');
  }

  // Step 1: generate a secret and return the otpauth URI to add to an authenticator app.
  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
    const account = user.email || user.profile?.username || userId;
    return { secret, otpauthUrl: authenticator.keyuri(account, 'AfriStage', secret) };
  }

  // Step 2: confirm a TOTP code, enable MFA, and return one-time recovery codes.
  async enableMfa(userId: string, token: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, omit: { mfaSecret: false } });
    if (!user.mfaSecret) throw new BadRequestException('Run MFA setup first');
    if (!token || !authenticator.verify({ token, secret: user.mfaSecret })) throw new BadRequestException('Invalid MFA token');

    const recoveryCodes = Array.from({ length: 8 }, () => authenticator.generateSecret().slice(0, 10).toLowerCase());
    const hashed = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaRecoveryCodes: hashed } });
    return { mfaEnabled: true, recoveryCodes }; // shown once
  }

  // ---- Password reset (admin-issued during beta: no email/SMS provider is
  // wired, so support verifies identity out-of-band and hands the one-time
  // token to the user; the public self-service *request* endpoint arrives with
  // the delivery provider). Token is 256-bit random, stored as sha256 (high-
  // entropy secret — bcrypt's cost adds nothing), 15 min TTL, single active
  // token per user (a new issue supersedes the old).

  async adminIssuePasswordResetToken(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('Unknown user');
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetTokenHash: createHash('sha256').update(token).digest('hex'), passwordResetExpiresAt: expiresAt }
    });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'user.password_reset_issued', target: userId, metadata: { expiresAt } }
    });
    return { token, expiresAt }; // plaintext shown once, to the admin only
  }

  // Public: exchange a live reset token for a new password. Non-enumerating
  // error; consumes the token and signs the user out everywhere (the old
  // password — and anyone holding it — must lose every session).
  async confirmPasswordReset(token: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { gt: new Date() } }
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null
      }
    });
    await this.logoutAll(user.id);
    return { ok: true };
  }

  // Admin MFA reset for a user who lost the device AND all recovery codes.
  // ROTATES the secret + recovery codes instead of disabling MFA: disabling
  // would hard-lock privileged accounts under REQUIRE_ADMIN_MFA=true (login
  // rejects before MFA setup is reachable), and MFA never silently drops off
  // an account. Signs the user out everywhere (if this was an attacker's
  // social-engineering attempt, stolen sessions die too). Identity must be
  // verified out-of-band before calling this; enrollment material is handed
  // to the user the same way.
  async adminResetMfa(actorId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { profile: true } });
    if (!user) throw new BadRequestException('Unknown user');
    if (!user.mfaEnabled) throw new BadRequestException('MFA is not enabled for this user');

    const secret = authenticator.generateSecret();
    const recoveryCodes = Array.from({ length: 8 }, () => authenticator.generateSecret().slice(0, 10).toLowerCase());
    const hashed = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaRecoveryCodes: hashed }
    });
    await this.logoutAll(userId);
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'user.mfa_reset', target: userId, metadata: {} }
    });
    const account = user.email || user.profile?.username || userId;
    return { otpauthUrl: authenticator.keyuri(account, 'AfriStage', secret), recoveryCodes }; // shown once
  }

  // Exchange a valid refresh JWT for a fresh token pair. Re-loads the user so a
  // suspended/deleted account can't refresh, and role changes take effect.
  // Session-aware (R5 §9 #6): a token carrying a sid must match a live, un-
  // revoked device session. Legacy tokens without a sid pass the tv check only,
  // and are migrated onto a fresh session so their next pair is revocable.
  async refresh(refreshToken: string, meta: SessionMeta = {}) {
    let payload: { sub: string; tv?: number; sid?: string; gen?: number };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh' });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    // Reject tokens issued before the last "sign out everywhere". Treat a missing
    // tv (legacy token) as version 0 so pre-revocation tokens still match a fresh account.
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) throw new UnauthorizedException('Refresh token has been revoked');

    let sid = payload.sid;
    let gen = 0;
    if (sid) {
      const session = await this.prisma.deviceSession.findUnique({ where: { id: sid } });
      if (!session || session.userId !== user.id || session.revokedAt) {
        throw new UnauthorizedException('This device has been signed out');
      }
      // Rotation: only the CURRENT generation may refresh. A superseded token
      // (rotated away — possibly stolen) dies here instead of living out its
      // 30d TTL. ponytail: reject-only; auto-revoking the session on reuse
      // (theft response) risks locking out clients that double-fire refresh.
      if ((payload.gen ?? 0) !== session.tokenGeneration) {
        throw new UnauthorizedException('This refresh token has been superseded');
      }
      gen = session.tokenGeneration + 1;
      await this.prisma.deviceSession.update({
        where: { id: sid },
        data: { lastSeenAt: new Date(), tokenGeneration: gen }
      });
    } else {
      sid = await this.openSession(user.id, undefined, meta); // migrate legacy token, generation 0
    }
    return this.issueTokens(user, sid, gen);
  }

  // Invalidate every existing refresh token for this user by bumping the version
  // embedded in them, and revoke every device session. Access tokens still
  // expire on their own short TTL.
  async logoutAll(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await this.prisma.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  issueTokens(user: { id: string; role: UserRole; email?: string | null; tokenVersion?: number }, sid?: string, gen = 0) {
    const payload = { sub: user.id, role: user.role, email: user.email, tv: user.tokenVersion ?? 0, ...(sid ? { sid, gen } : {}) };
    return {
      userId: user.id,
      role: user.role,
      accessToken: this.jwt.sign(payload, {
        secret: process.env.JWT_ACCESS_SECRET || 'dev',
        expiresIn: process.env.JWT_ACCESS_TTL || '15m'
      }),
      refreshToken: this.jwt.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh',
        expiresIn: process.env.JWT_REFRESH_TTL || '30d'
      })
    };
  }
}
