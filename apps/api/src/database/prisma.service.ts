import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
  constructor() {
    super({ omit: { user: GLOBAL_USER_OMIT } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
