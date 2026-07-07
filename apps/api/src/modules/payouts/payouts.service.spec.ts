import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { PayoutsService } from './payouts.service';

function build() {
  const prisma: any = {
    payoutRequest: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    creatorProfile: { findUnique: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const wallet: any = {
    balance: jest.fn().mockResolvedValue('1000000'),
    account: jest.fn().mockResolvedValue({ id: 'acc' }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'clearing' })
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };
  const notifications: any = { notifyUser: jest.fn().mockResolvedValue({}) };
  const service = new PayoutsService(prisma, wallet, new MoneyService(prisma, ledger, wallet, new MetricsService()), notifications);
  return { service, prisma, wallet, ledger, notifications };
}

const reqDto = { coinAmount: 1000, idempotencyKey: 'idem-1' };

describe('PayoutsService', () => {
  it('returns the existing payout for a duplicate idempotency key (same amount)', async () => {
    const { service, prisma } = build();
    const existing = { id: 'p-existing', creatorUserId: 'c1', coinAmount: BigInt(reqDto.coinAmount) };
    prisma.payoutRequest.findUnique.mockResolvedValue(existing);
    await expect(service.request('c1', reqDto)).resolves.toBe(existing);
    expect(prisma.payoutRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a reused idempotency key with a different amount', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique
        .mockResolvedValue({ id: 'p-existing', creatorUserId: 'c1', coinAmount: 999n });
    await expect(service.request('c1', reqDto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a payout below the minimum threshold', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    await expect(service.request('c1', { coinAmount: 100, idempotencyKey: 'k' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a payout when creator KYC/payout is not enabled', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: false, kycStatus: 'APPROVED', createdAt: new Date() });
    await expect(service.request('c1', reqDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approves an UNDER_REVIEW payout', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'APPROVED' });
    await expect(service.approve('admin', 'p1')).resolves.toMatchObject({ status: 'APPROVED' });
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
  });

  it('cannot approve a PAID payout', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'PAID', coinAmount: 1000n });
    await expect(service.approve('admin', 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('holds an UNDER_REVIEW payout (UNDER_REVIEW -> HELD)', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'HELD' });
    await expect(service.hold('admin', 'p1', 'investigate')).resolves.toMatchObject({ status: 'HELD' });
  });

  it('cannot hold a PAID payout', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'PAID', coinAmount: 1000n });
    await expect(service.hold('admin', 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot mark a REJECTED payout as paid', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'REJECTED', coinAmount: 1000n });
    await expect(service.markPaid('admin', 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot mark a PAID payout as paid again', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'PAID', coinAmount: 1000n });
    await expect(service.markPaid('admin', 'p1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('cannot reject a PAID payout', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'PAID', coinAmount: 1000n });
    await expect(service.reject('admin', 'p1', 'x')).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks an APPROVED payout as PAID (hold -> clearing)', async () => {
    const { service, prisma, ledger } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'APPROVED', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'PAID' });
    await expect(service.markPaid('admin', 'p1')).resolves.toMatchObject({ status: 'PAID' });
    expect(ledger.postTransaction).toHaveBeenCalled();
  });

  it('notifies the creator when a payout is approved', async () => {
    const { service, prisma, notifications } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'APPROVED' });
    await service.approve('admin', 'p1');
    expect(notifications.notifyUser).toHaveBeenCalledWith('c1', 'PAYOUT_UPDATE', 'Payout approved', expect.any(String));
  });

  it('a failed notification never breaks the payout transition', async () => {
    const { service, prisma, notifications } = build();
    notifications.notifyUser.mockRejectedValue(new Error('notif down'));
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'APPROVED' });
    await expect(service.approve('admin', 'p1')).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('records the external transfer reference when marking PAID', async () => {
    const { service, prisma } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'APPROVED', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'PAID' });
    await service.markPaid('admin', 'p1', '  PSK_TRX_999  ');
    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerReference: 'PSK_TRX_999' }) })
    );
  });

  it('snapshots the destination onto the payout request', async () => {
    const { service, prisma } = build();
    prisma.payoutMethod = {
      findFirst: jest.fn().mockResolvedValue({
        provider: 'PAYSTACK_BANK',
        label: 'GTB Savings',
        destinationReference: '0123456789',
        country: 'NG'
      })
    };
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() });
    prisma.payoutRequest.create.mockResolvedValue({ id: 'p1' });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW' });
    await service.request('c1', { coinAmount: 1000, idempotencyKey: 'snap-1', payoutMethodId: 'm1' });
    expect(prisma.payoutRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutProvider: 'PAYSTACK_BANK',
          payoutDestinationLabel: 'GTB Savings',
          payoutDestinationReference: '0123456789',
          payoutCountry: 'NG'
        })
      })
    );
  });

  it('reject returns funds from hold to earnings', async () => {
    const { service, prisma, ledger } = build();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'REJECTED' });
    await expect(service.reject('admin', 'p1', 'fraud')).resolves.toMatchObject({ status: 'REJECTED' });
    expect(ledger.postTransaction).toHaveBeenCalled(); // hold -> earnings reversal
  });
});

// Extends build() with payout-method storage + a pass-through $transaction so the
// method-CRUD and remaining request/admin error paths are exercised.
function buildFull() {
  const prisma: any = {
    payoutRequest: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    creatorProfile: { findUnique: jest.fn() },
    payoutMethod: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'm1', isDefault: true }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (cb: any) => cb(prisma))
  };
  const wallet: any = {
    balance: jest.fn().mockResolvedValue('1000000'),
    account: jest.fn().mockResolvedValue({ id: 'acc' }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'clearing' })
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };
  const notifications: any = { notifyUser: jest.fn().mockResolvedValue({}) };
  const service = new PayoutsService(prisma, wallet, new MoneyService(prisma, ledger, wallet, new MetricsService()), notifications);
  return { service, prisma, wallet, ledger, notifications };
}

describe('PayoutsService payout methods', () => {
  it('lists methods default-first', async () => {
    const { service, prisma } = buildFull();
    await service.listMethods('c1');
    expect(prisma.payoutMethod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'c1' } })
    );
  });

  it('forces the first method to be the default', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutMethod.count.mockResolvedValue(0);
    await service.createMethod('c1', { provider: 'BANK', country: 'ng', currency: 'ngn', destinationReference: '123', label: 'GTB' } as any);
    expect(prisma.payoutMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true, country: 'NG', currency: 'NGN' }) })
    );
  });

  it('demotes other defaults when a new explicit default is added', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutMethod.count.mockResolvedValue(2);
    await service.createMethod('c1', { provider: 'BANK', country: 'NG', currency: 'NGN', destinationReference: '123', label: 'GTB', isDefault: true } as any);
    expect(prisma.payoutMethod.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'c1', isDefault: true }, data: { isDefault: false } })
    );
  });

  it('deletes a method scoped to its owner', async () => {
    const { service, prisma } = buildFull();
    await expect(service.deleteMethod('c1', 'm1')).resolves.toEqual({ ok: true });
    expect(prisma.payoutMethod.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'c1' } });
  });
});

describe('PayoutsService.request (remaining error paths)', () => {
  const dto = { coinAmount: 1000, idempotencyKey: 'k' };

  it('rejects when earnings are insufficient', async () => {
    const { service, prisma, wallet } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() });
    wallet.balance.mockResolvedValue('500'); // < 1000 requested
    await expect(service.request('c1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a payout method that is not the creator’s', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() });
    prisma.payoutMethod.findFirst.mockResolvedValue(null); // not found / foreign
    await expect(
      service.request('c1', { ...dto, payoutMethodId: 'foreign' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the existing payout when a concurrent insert wins the unique key (P2002)', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() });
    prisma.payoutRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' } as any)
    );
    prisma.payoutRequest.findUniqueOrThrow.mockResolvedValue({ id: 'winner' });
    await expect(service.request('c1', dto)).resolves.toMatchObject({ id: 'winner' });
  });

  it('holds a large payout from a brand-new creator for review', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() }); // age ~0 days
    prisma.payoutRequest.create.mockResolvedValue({ id: 'p1' });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'HELD' });
    const big = { coinAmount: 1_000_000, idempotencyKey: 'big' };
    await service.request('c1', big);
    expect(prisma.payoutRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'HELD' }) })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalled(); // payout.held audit
  });
});

describe('PayoutsService admin transitions (not-found + release)', () => {
  it('release moves HELD -> UNDER_REVIEW', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'HELD', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW' });
    await expect(service.release('admin', 'p1')).resolves.toMatchObject({ status: 'UNDER_REVIEW' });
  });

  it.each([
    ['approve', (s: PayoutsService) => s.approve('a', 'missing')],
    ['hold', (s: PayoutsService) => s.hold('a', 'missing')],
    ['release', (s: PayoutsService) => s.release('a', 'missing')],
    ['reject', (s: PayoutsService) => s.reject('a', 'missing', 'r')],
    ['markPaid', (s: PayoutsService) => s.markPaid('a', 'missing')]
  ])('%s throws NotFound for a missing payout', async (_name, act) => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    await expect(act(service)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PayoutsService.request rethrow + admin reads', () => {
  it('rethrows a non-unique create failure', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue(null);
    prisma.creatorProfile.findUnique.mockResolvedValue({ payoutEnabled: true, kycStatus: 'APPROVED', createdAt: new Date() });
    prisma.payoutRequest.create.mockRejectedValue(new Error('db down'));
    await expect(service.request('c1', { coinAmount: 1000, idempotencyKey: 'k' })).rejects.toThrow('db down');
  });

  it('mine lists the creator’s payouts', async () => {
    const { service, prisma } = buildFull();
    await service.mine('c1');
    expect(prisma.payoutRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { creatorUserId: 'c1' } }));
  });

  it('adminList filters by status when provided, else lists all', async () => {
    const { service, prisma } = buildFull();
    await service.adminList('UNDER_REVIEW');
    expect(prisma.payoutRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'UNDER_REVIEW' } }));
    await service.adminList();
    expect(prisma.payoutRequest.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('PayoutsService remaining branches', () => {
  it('rejects a reused idempotency key that belongs to a different creator', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', creatorUserId: 'someone-else', coinAmount: 1000n });
    await expect(service.request('c1', { coinAmount: 1000, idempotencyKey: 'k' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('hold without a reason records the default audit reason', async () => {
    const { service, prisma } = buildFull();
    prisma.payoutRequest.findUnique.mockResolvedValue({ id: 'p1', status: 'UNDER_REVIEW', creatorUserId: 'c1', coinAmount: 1000n });
    prisma.payoutRequest.update.mockResolvedValue({ id: 'p1', status: 'HELD' });
    await service.hold('admin', 'p1');
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ reason: 'admin hold' }) }) })
    );
  });
});
