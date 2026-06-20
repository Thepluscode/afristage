import { CreatorsService } from './creators.service';

function build() {
  const prisma: any = {
    creatorProfile: {
      upsert: jest.fn().mockResolvedValue({ id: 'cp1' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cp1', ...data }))
    },
    user: { update: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const wallet: any = { ensureUserWallets: jest.fn() };
  return { service: new CreatorsService(prisma, wallet), prisma };
}

const dto = { stageName: 'X', category: 'MUSIC', country: 'NG', language: 'pidgin' } as any;

describe('CreatorsService approval workflow', () => {
  it('apply starts PENDING and does NOT promote the user role', async () => {
    const { service, prisma } = build();
    await service.apply('u1', dto);
    expect(prisma.creatorProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ approvalStatus: 'PENDING' }) })
    );
    expect(prisma.user.update).not.toHaveBeenCalled(); // no auto-promotion
  });

  it('approveCreator promotes to CREATOR + writes audit log', async () => {
    const { service, prisma } = build();
    await service.approveCreator('admin', 'u1');
    expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'APPROVED' }) })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'CREATOR' } }));
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_APPROVED' }) })
    );
  });

  it('rejectCreator sets REJECTED + writes audit log, no role change', async () => {
    const { service, prisma } = build();
    await service.rejectCreator('admin', 'u1', 'bad');
    expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'REJECTED', rejectionReason: 'bad' }) })
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_REJECTED' }) })
    );
  });
});
