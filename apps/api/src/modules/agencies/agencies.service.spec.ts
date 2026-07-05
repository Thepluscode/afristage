import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgenciesService } from './agencies.service';

function build() {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner1' }) },
    agency: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ag1', ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ag1', ...data }))
    },
    agencyCreator: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 })
    },
    creatorProfile: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'c1' }),
      findMany: jest.fn().mockResolvedValue([])
    }
  };
  const wallet: any = {
    ensureAccount: jest.fn().mockResolvedValue({ id: 'agacc', balanceMinor: 123n })
  };
  return { service: new AgenciesService(prisma, wallet), prisma, wallet };
}

describe('AgenciesService.create', () => {
  it('creates the agency with a default 10% commission and provisions the pot', async () => {
    const { service, prisma, wallet } = build();
    const res = await service.create({ name: 'Lagos Talent', ownerUserId: 'owner1' } as any);
    expect(res).toMatchObject({ name: 'Lagos Talent', commissionBps: 1000 });
    expect(wallet.ensureAccount).toHaveBeenCalledWith('owner1', 'AGENCY_EARNING', 'COIN');
    // explicit bps carries through
    await service.create({ name: 'Accra Talent', ownerUserId: 'owner1', commissionBps: 2500 } as any);
    expect(prisma.agency.create.mock.calls[1][0].data.commissionBps).toBe(2500);
  });

  it('rejects an unknown owner user', async () => {
    const { service, prisma } = build();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.create({ name: 'Ghost', ownerUserId: 'nope' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AgenciesService reads + update', () => {
  it('list includes creator counts', async () => {
    const { service, prisma } = build();
    await service.list();
    expect(prisma.agency.findMany.mock.calls[0][0].include._count.select.creators).toBe(true);
  });

  it('detail 404s unknown agencies and enriches creators + earnings', async () => {
    const { service, prisma } = build();
    await expect(service.detail('ghost')).rejects.toBeInstanceOf(NotFoundException);
    prisma.agency.findUnique.mockResolvedValue({
      id: 'ag1', name: 'Lagos Talent', ownerUserId: 'owner1', commissionBps: 1000, status: 'ACTIVE',
      creators: [{ creatorUserId: 'c1', addedAt: new Date(0) }, { creatorUserId: 'c2', addedAt: new Date(0) }]
    });
    prisma.creatorProfile.findMany.mockResolvedValue([{ userId: 'c1', stageName: 'MC One', approvalStatus: 'APPROVED' }]);
    const res = await service.detail('ag1');
    expect(res.earningsCoins).toBe('123');
    expect(res.creators).toEqual([
      expect.objectContaining({ creatorUserId: 'c1', stageName: 'MC One', approvalStatus: 'APPROVED' }),
      expect.objectContaining({ creatorUserId: 'c2', stageName: null, approvalStatus: null }) // missing profile fallback
    ]);
  });

  it('update 404s unknown agencies and patches config', async () => {
    const { service, prisma } = build();
    await expect(service.update('ghost', { commissionBps: 500 } as any)).rejects.toBeInstanceOf(NotFoundException);
    prisma.agency.findUnique.mockResolvedValue({ id: 'ag1' });
    const res = await service.update('ag1', { commissionBps: 500, status: 'SUSPENDED' } as any);
    expect(res).toMatchObject({ commissionBps: 500, status: 'SUSPENDED' });
  });
});

describe('AgenciesService creator assignment', () => {
  it('assigns a creator; idempotent for the same agency; rejects poaching', async () => {
    const { service, prisma } = build();
    prisma.agency.findUnique.mockResolvedValue({ id: 'ag1' });
    await expect(service.addCreator('ag1', 'c1')).resolves.toEqual({ ok: true, alreadyManaged: false });
    expect(prisma.agencyCreator.create).toHaveBeenCalledWith({ data: { agencyId: 'ag1', creatorUserId: 'c1' } });
    prisma.agencyCreator.findUnique.mockResolvedValue({ agencyId: 'ag1' });
    await expect(service.addCreator('ag1', 'c1')).resolves.toEqual({ ok: true, alreadyManaged: true });
    prisma.agencyCreator.findUnique.mockResolvedValue({ agencyId: 'other' });
    await expect(service.addCreator('ag1', 'c1')).rejects.toThrow('already managed by another agency');
  });

  it('rejects unknown agencies and non-creators', async () => {
    const { service, prisma } = build();
    await expect(service.addCreator('ghost', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    prisma.agency.findUnique.mockResolvedValue({ id: 'ag1' });
    prisma.creatorProfile.findUnique.mockResolvedValue(null);
    await expect(service.addCreator('ag1', 'viewer')).rejects.toThrow('no creator profile');
  });

  it('removeCreator deletes the link and 404s when absent', async () => {
    const { service, prisma } = build();
    await expect(service.removeCreator('ag1', 'c1')).resolves.toEqual({ ok: true });
    prisma.agencyCreator.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removeCreator('ag1', 'c1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AgenciesService.commissionFor', () => {
  it('returns the split for an ACTIVE managed creator, null otherwise', async () => {
    const { service, prisma } = build();
    await expect(service.commissionFor('c1')).resolves.toBeNull(); // unmanaged
    prisma.agencyCreator.findUnique.mockResolvedValue({
      agency: { id: 'ag1', ownerUserId: 'owner1', status: 'ACTIVE', commissionBps: 1000 }
    });
    await expect(service.commissionFor('c1')).resolves.toEqual({ agencyId: 'ag1', ownerUserId: 'owner1', commissionBps: 1000 });
    prisma.agencyCreator.findUnique.mockResolvedValue({
      agency: { id: 'ag1', ownerUserId: 'owner1', status: 'SUSPENDED', commissionBps: 1000 }
    });
    await expect(service.commissionFor('c1')).resolves.toBeNull(); // suspended
    prisma.agencyCreator.findUnique.mockResolvedValue({
      agency: { id: 'ag1', ownerUserId: 'owner1', status: 'ACTIVE', commissionBps: 0 }
    });
    await expect(service.commissionFor('c1')).resolves.toBeNull(); // zero commission
  });
});
