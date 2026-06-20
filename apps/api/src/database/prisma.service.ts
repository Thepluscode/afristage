import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // ponytail: globally strip secrets from every user read so they can never leak
    // through any endpoint's relation include. Auth opts back in (omit:false) on the
    // specific queries that must verify a password or second factor.
    super({ omit: { user: { passwordHash: true, mfaSecret: true, mfaRecoveryCodes: true } } });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
