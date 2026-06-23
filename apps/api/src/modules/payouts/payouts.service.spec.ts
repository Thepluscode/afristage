import { BadRequestException, ConflictException } from '@nestjs/common';
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
  const service = new PayoutsService(prisma, wallet, ledger);
  return { service, prisma, wallet, ledger };
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
