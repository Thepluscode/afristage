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

function buildFull() {
  const prisma: any = {
    creatorProfile: {
      findUnique: jest.fn().mockResolvedValue({ id: 'cp1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cp1', ...data }))
    },
    user: { update: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    profile: { findUnique: jest.fn().mockResolvedValue({ avatarUrl: null, displayName: 'D' }), findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    liveRoom: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalWatchSeconds: null }, _max: { peakViewers: null } })
    },
    follow: { count: jest.fn().mockResolvedValue(0) },
    roomReminder: { findUnique: jest.fn().mockResolvedValue(null) }
  };
  const wallet: any = { balance: jest.fn().mockResolvedValue('0'), ensureUserWallets: jest.fn() };
  return { service: new CreatorsService(prisma, wallet), prisma, wallet };
}

describe('CreatorsService.suspendCreator', () => {
  it('sets SUSPENDED with a reason + writes an audit log', async () => {
    const { service, prisma } = build();
    await service.suspendCreator('admin', 'u1', 'ToS breach');
    expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'SUSPENDED', rejectionReason: 'ToS breach' }) })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_SUSPENDED' }) })
    );
  });
});

describe('CreatorsService.getPublic', () => {
  it('returns null for an unknown creator', async () => {
    const { service, prisma } = buildFull();
    prisma.creatorProfile.findFirst.mockResolvedValue(null);
    expect(await service.getPublic('nope', 'v1')).toBeNull();
  });

  it('enriches the profile with follow state + upcoming reminder for a viewer', async () => {
    const { service, prisma } = buildFull();
    prisma.creatorProfile.findFirst.mockResolvedValue({ id: 'cp1', userId: 'c1', user: { profile: {} } });
    prisma.follow.count.mockResolvedValue(1); // followers + isFollowing
    prisma.liveRoom.findFirst.mockResolvedValue({ id: 'r1', title: 'Next', category: 'MUSIC', scheduledStartAt: new Date() });
    prisma.roomReminder.findUnique.mockResolvedValue({ id: 'rem1' }); // already reminded
    const res = await service.getPublic('c1', 'v1');
    expect(res).toMatchObject({ isFollowing: true });
    expect((res as any).upcomingRoom.reminded).toBe(true);
  });
});

describe('CreatorsService.dashboard', () => {
  it('aggregates earnings, totals, and resolves top supporters', async () => {
    const { service, prisma } = buildFull();
    prisma.giftTransaction.groupBy.mockResolvedValue([{ viewerId: 's1', _sum: { totalCoinAmount: 50 } }]);
    prisma.profile.findMany.mockResolvedValue([{ userId: 's1', displayName: 'Big Fan', avatarUrl: null }]);
    const res = await service.dashboard('c1');
    expect(res.topSupporters).toEqual([
      { userId: 's1', displayName: 'Big Fan', avatarUrl: null, coins: 50 }
    ]);
    expect(res).toMatchObject({ totalGiftTransactions: 0, totalRooms: 0, followers: 0 });
  });
});

describe('CreatorsService remaining branches', () => {
  it('myRooms falls back to the default page size for a zero limit', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findMany.mockResolvedValue([]);
    await service.myRooms('c1', 0);
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it('dashboard with no supporters returns an empty leaderboard', async () => {
    const { service, prisma } = buildFull();
    prisma.giftTransaction.groupBy.mockResolvedValue([]);
    const res = await service.dashboard('c1');
    expect(res.topSupporters).toEqual([]);
    expect(prisma.profile.findMany).not.toHaveBeenCalled();
  });

  it('dashboard tolerates a supporter with no profile + null coin sum', async () => {
    const { service, prisma } = buildFull();
    prisma.giftTransaction.groupBy.mockResolvedValue([{ viewerId: 's1', _sum: { totalCoinAmount: null } }]);
    prisma.profile.findMany.mockResolvedValue([]);
    const res = await service.dashboard('c1');
    expect(res.topSupporters[0]).toMatchObject({ displayName: 'Supporter', coins: 0 });
  });

  it('getPublic without a viewer skips follow + reminder lookups', async () => {
    const { service, prisma } = buildFull();
    prisma.creatorProfile.findFirst.mockResolvedValue({ id: 'cp1', userId: 'c1', user: { profile: {} } });
    prisma.liveRoom.findFirst.mockResolvedValue({ id: 'r1', title: 'Next', category: 'MUSIC', scheduledStartAt: new Date() });
    const res = await service.getPublic('c1'); // no viewerId
    expect(res).toMatchObject({ isFollowing: false });
    expect((res as any).upcomingRoom.reminded).toBeUndefined();
    expect(prisma.roomReminder.findUnique).not.toHaveBeenCalled();
  });
});
