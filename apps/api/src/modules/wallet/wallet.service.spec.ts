import { NotFoundException } from '@nestjs/common';
import { WalletAccountType } from '@prisma/client';
import { WalletService } from './wallet.service';

function build() {
  const prisma: any = {
    walletAccount: {
      createMany: jest.fn().mockResolvedValue({ count: 3 }),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) }
  };
  const ledger: any = {};
  return { service: new WalletService(prisma, ledger), prisma };
}

describe('WalletService.account', () => {
  it('returns the account when it exists', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'acc1' });
    await expect(service.account('u1', WalletAccountType.COIN, 'COIN')).resolves.toMatchObject({ id: 'acc1' });
  });

  it('throws NotFound when the wallet is missing', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue(null);
    await expect(service.account('u1', WalletAccountType.COIN, 'COIN')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('WalletService.balance', () => {
  it('nets credits against debits into a string balance', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'acc1' });
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amountMinor: '100', direction: 'CREDIT', currency: 'COIN' },
      { amountMinor: '30', direction: 'DEBIT', currency: 'COIN' },
      { amountMinor: '5', direction: 'CREDIT', currency: 'COIN' }
    ]);
    await expect(service.balance('u1', WalletAccountType.COIN, 'COIN')).resolves.toBe('75');
  });
});

describe('WalletService.ensureSystemAccount', () => {
  it('returns the existing system account', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'sys1' });
    await expect(service.ensureSystemAccount(WalletAccountType.PAYMENT_CLEARING, 'COIN')).resolves.toMatchObject({ id: 'sys1' });
    expect(prisma.walletAccount.create).not.toHaveBeenCalled();
  });

  it('creates the system account when none exists', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue(null);
    prisma.walletAccount.create.mockResolvedValue({ id: 'sys-new' });
    await expect(service.ensureSystemAccount(WalletAccountType.PAYMENT_CLEARING, 'COIN')).resolves.toMatchObject({ id: 'sys-new' });
  });

  it('falls back to the race winner when create loses the unique index', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue(null);
    prisma.walletAccount.create.mockRejectedValue(new Error('unique violation'));
    prisma.walletAccount.findFirstOrThrow.mockResolvedValue({ id: 'race-winner' });
    await expect(service.ensureSystemAccount(WalletAccountType.PAYMENT_CLEARING, 'COIN')).resolves.toMatchObject({ id: 'race-winner' });
  });
});

describe('WalletService.ensureUserWallets', () => {
  it('creates the three wallet accounts idempotently (skipDuplicates)', async () => {
    const { service, prisma } = build();
    await service.ensureUserWallets('u1', 'COIN');
    expect(prisma.walletAccount.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
    expect(prisma.walletAccount.createMany.mock.calls[0][0].data).toHaveLength(3);
  });
});

describe('WalletService.summary', () => {
  it('provisions wallets then returns all three balances', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'acc' }); // every balance() lookup resolves
    const res = await service.summary('u1');
    expect(prisma.walletAccount.createMany).toHaveBeenCalled();
    expect(res).toEqual({ coinBalance: '0', earningBalance: '0', payoutHoldBalance: '0' });
  });
});
