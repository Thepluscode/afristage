import { Injectable, NotFoundException } from '@nestjs/common';
import { WalletAccountType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from './ledger.service';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async ensureUserWallets(userId: string, currency: string) {
    // Idempotent + race-safe: @@unique([userId, accountType, currency]) makes
    // skipDuplicates a real no-op on repeat, instead of creating duplicate accounts.
    await this.prisma.walletAccount.createMany({
      data: [WalletAccountType.COIN, WalletAccountType.EARNING, WalletAccountType.PAYOUT_HOLD].map((accountType) => ({
        userId,
        accountType,
        currency
      })),
      skipDuplicates: true
    });
  }

  async ensureSystemAccount(accountType: WalletAccountType, currency: string) {
    const existing = await this.prisma.walletAccount.findFirst({ where: { userId: null, accountType, currency } });
    if (existing) return existing;
    try {
      return await this.prisma.walletAccount.create({ data: { userId: null, accountType, currency } });
    } catch {
      // Lost a race to the partial unique index — fetch the winner.
      return this.prisma.walletAccount.findFirstOrThrow({ where: { userId: null, accountType, currency } });
    }
  }

  // Ensure-or-get a single account (agency pots are created on first use,
  // not at registration like the standard user trio).
  async ensureAccount(userId: string, accountType: WalletAccountType, currency: string) {
    await this.prisma.walletAccount.createMany({ data: [{ userId, accountType, currency }], skipDuplicates: true });
    return this.account(userId, accountType, currency);
  }

  async account(userId: string, accountType: WalletAccountType, currency: string) {
    const account = await this.prisma.walletAccount.findFirst({ where: { userId, accountType, currency } });
    if (!account) throw new NotFoundException(`Missing ${accountType} wallet`);
    return account;
  }

  async balance(userId: string, accountType: WalletAccountType | string, currency: string) {
    // O(1): the materialised balance is maintained atomically by every ledger
    // post; ledger-integrity cross-checks it against the entry sums.
    const account = await this.account(userId, accountType as WalletAccountType, currency);
    return BigInt(account.balanceMinor).toString();
  }

  async summary(userId: string) {
    await this.ensureUserWallets(userId, 'COIN');
    return {
      coinBalance: await this.balance(userId, WalletAccountType.COIN, 'COIN'),
      earningBalance: await this.balance(userId, WalletAccountType.EARNING, 'COIN'),
      payoutHoldBalance: await this.balance(userId, WalletAccountType.PAYOUT_HOLD, 'COIN')
    };
  }

  async ledgerHistory(userId: string) {
    const accounts = await this.prisma.walletAccount.findMany({ where: { userId } });
    return this.prisma.ledgerEntry.findMany({
      where: { accountId: { in: accounts.map((account) => account.id) } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { transaction: true, account: true }
    });
  }
}
