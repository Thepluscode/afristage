import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PRIVILEGED_ROLES, SEEDED_IDENTIFIERS } from '../config/seeded-accounts';

// The credentials stripped from EVERY user read so they can never leak through any
// endpoint's relation include. Exported so the api-exposure guard can assert none
// is ever dropped. Auth opts back in (omit:false) on the specific queries that must
// verify a password or second factor. See docs/api-exposure.md.
export const GLOBAL_USER_OMIT = {
  passwordHash: true,
  mfaSecret: true,
  mfaRecoveryCodes: true,
  passwordResetTokenHash: true
} as const;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ omit: { user: GLOBAL_USER_OMIT } });
  }

  async onModuleInit() {
    await this.$connect();
    await this.warnAboutSeededPrivilegedAccounts();
  }

  /**
   * Say out loud, on every boot, that a demo account with a published password
   * holds privileges in this database.
   *
   * On 2026-09-22 production held `admin@afristage.local` as an ACTIVE
   * SUPER_ADMIN, created 2026-07-13. Login refuses seeded identifiers in
   * production — but that refusal is one env var (ALLOW_SEEDED_PROD_LOGIN)
   * away from being off, and nothing anywhere said the row existed.
   *
   * A warning, not a crash: refusing to boot would turn a latent risk into an
   * outage, and the operator cannot fix it while the service is down. It never
   * throws for the same reason — a diagnostic that can take the API down is a
   * liability, not a control.
   */
  private async warnAboutSeededPrivilegedAccounts(): Promise<void> {
    try {
      const rows = await this.user.findMany({
        where: {
          email: { in: SEEDED_IDENTIFIERS, mode: 'insensitive' },
          role: { in: PRIVILEGED_ROLES as never },
          status: { not: 'DELETED' }
        },
        select: { email: true, role: true, status: true }
      });
      if (!rows.length) return;
      const where = process.env.NODE_ENV === 'production' ? 'PRODUCTION' : `NODE_ENV=${process.env.NODE_ENV ?? 'unset'}`;
      for (const row of rows) {
        this.logger.warn(
          `[seeded-account] ${row.email} holds ${row.role} (${row.status}) in ${where}. ` +
            'Its password is published in prisma/seed.ts. Login is refused unless ALLOW_SEEDED_PROD_LOGIN=true — ' +
            'delete or demote the row rather than relying on that flag.'
        );
      }
    } catch (error) {
      // Never let a diagnostic stop the service starting.
      this.logger.warn(`[seeded-account] check could not run: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
