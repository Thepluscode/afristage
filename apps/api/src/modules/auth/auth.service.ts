import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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

  async register(dto: RegisterDto) {
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
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
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
    return this.issueTokens(user);
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

  // Exchange a valid refresh JWT for a fresh token pair. Re-loads the user so a
  // suspended/deleted account can't refresh, and role changes take effect.
  // ponytail: stateless JWT refresh (no server-side rotation/revocation list yet).
  // Before public beta, add rotation + a device-session revocation table.
  async refresh(refreshToken: string) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET || 'dev-refresh' });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active');
    return this.issueTokens(user);
  }

  issueTokens(user: { id: string; role: UserRole; email?: string | null }) {
    const payload = { sub: user.id, role: user.role, email: user.email };
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
