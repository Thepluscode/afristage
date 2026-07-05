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
  it('returns the materialised account balance as a string (no entry scan)', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'acc1', balanceMinor: 75n });
    await expect(service.balance('u1', WalletAccountType.COIN, 'COIN')).resolves.toBe('75');
    expect(prisma.ledgerEntry.findMany).not.toHaveBeenCalled();
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
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'acc', balanceMinor: 0n }); // every balance() lookup resolves
    const res = await service.summary('u1');
    expect(prisma.walletAccount.createMany).toHaveBeenCalled();
    expect(res).toEqual({ coinBalance: '0', earningBalance: '0', payoutHoldBalance: '0' });
  });
});

describe('WalletService.ledgerHistory', () => {
  it('returns recent entries across all of the user’s accounts', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prisma.ledgerEntry.findMany.mockResolvedValue([{ id: 'e1' }]);
    const res = await service.ledgerHistory('u1');
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: { in: ['a1', 'a2'] } }, take: 100 })
    );
    expect(res).toEqual([{ id: 'e1' }]);
  });
});

describe('WalletService.ensureAccount', () => {
  it('creates the single account idempotently then returns it', async () => {
    const { service, prisma } = build();
    prisma.walletAccount.findFirst.mockResolvedValue({ id: 'agacc', accountType: 'AGENCY_EARNING' });
    const res = await service.ensureAccount('owner1', WalletAccountType.AGENCY_EARNING, 'COIN');
    expect(prisma.walletAccount.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'owner1', accountType: 'AGENCY_EARNING', currency: 'COIN' }],
      skipDuplicates: true
    });
    expect(res).toMatchObject({ id: 'agacc' });
  });
});
