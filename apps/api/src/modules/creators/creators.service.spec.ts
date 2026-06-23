import { CreatorsService } from './creators.service';

function build() {
  const prisma: any = {
    creatorProfile: {
      upsert: jest.fn().mockResolvedValue({ id: 'cp1' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cp1', ...data }))
    },
    user: { update: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    liveRoom: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]) }
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

describe('CreatorsService.myRooms', () => {
  it('returns [] and skips the gift query when the creator has no rooms', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    expect(await service.myRooms('u1')).toEqual([]);
    expect(prisma.giftTransaction.groupBy).not.toHaveBeenCalled();
  });

  it('joins per-room gift volume, defaulting rooms with no gifts to zero', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findMany.mockResolvedValue([
      { id: 'r1', title: 'Show A', peakViewers: 30, totalWatchSeconds: 1200n },
      { id: 'r2', title: 'Show B', peakViewers: 5, totalWatchSeconds: 60n }
    ]);
    prisma.giftTransaction.groupBy.mockResolvedValue([
      { roomId: 'r1', _sum: { totalCoinAmount: 800 }, _count: 12 }
    ]);
    const rooms = await service.myRooms('u1');
    expect(rooms[0]).toMatchObject({ id: 'r1', giftVolumeCoins: 800, giftCount: 12 });
    expect(rooms[1]).toMatchObject({ id: 'r2', giftVolumeCoins: 0, giftCount: 0 });
  });

  it('bounds the limit to 1..100', async () => {
    const { service, prisma } = build();
    await service.myRooms('u1', 9999);
    expect(prisma.liveRoom.findMany.mock.calls[0][0].take).toBe(100);
  });
});
