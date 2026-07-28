import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AggregationService } from '../aggregation/aggregation.service';
import { CreatorsService } from './creators.service';

function build(existing: any = null) {
  const prisma: any = {
    creatorProfile: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cp1', ...data })),
      upsert: jest.fn().mockResolvedValue({ id: 'cp1' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'cp1', ...data }))
    },
    user: { update: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    liveRoom: { findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { groupBy: jest.fn().mockResolvedValue([]) }
  };
  const wallet: any = { ensureUserWallets: jest.fn() };
  return { service: new CreatorsService(prisma, wallet, new AggregationService(prisma)), prisma };
}

const dto = { stageName: 'X', category: 'MUSIC', country: 'NG', language: 'pidgin' } as any;

describe('CreatorsService approval workflow', () => {
  it('apply starts PENDING and does NOT promote the user role', async () => {
    const { service, prisma } = build();
    await service.apply('u1', dto);
    expect(prisma.creatorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'PENDING' }) })
    );
    expect(prisma.user.update).not.toHaveBeenCalled(); // no auto-promotion
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_APPLIED' }) })
    );
  });

  // CreatorProfile has two editors — the applicant owns the text, the reviewer
  // owns the decision. These pin the boundary between them.
  describe('two editors, one row', () => {
    const raceLost = new Prisma.PrismaClientKnownRequestError('Record to update not found', {
      code: 'P2025',
      clientVersion: '5'
    });

    it('an approved creator editing their details keeps the approval they were granted', async () => {
      const { service, prisma } = build({ approvalStatus: 'APPROVED', reviewedById: 'admin' });
      await service.apply('u1', { ...dto, stageName: 'Renamed' });
      const call = prisma.creatorProfile.update.mock.calls[0][0];
      expect(call.data.stageName).toBe('Renamed'); // the applicant's edit lands
      expect(call.data.approvalStatus).toBeUndefined(); // the decision is untouched
      expect(call.data.reviewedById).toBeUndefined();
    });

    it('a pending applicant editing stays pending without rewriting the decision', async () => {
      const { service, prisma } = build({ approvalStatus: 'PENDING', reviewedById: null });
      await service.apply('u1', dto);
      expect(prisma.creatorProfile.update.mock.calls[0][0].data.approvalStatus).toBeUndefined();
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_APPLICATION_AMENDED' }) })
      );
    });

    it('a rejected applicant re-applying reopens review and clears the stale reviewer', async () => {
      const { service, prisma } = build({ approvalStatus: 'REJECTED', reviewedById: 'admin', rejectionReason: 'no' });
      await service.apply('u1', dto);
      expect(prisma.creatorProfile.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ approvalStatus: 'PENDING', rejectionReason: null, reviewedById: null, reviewedAt: null })
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_REAPPLIED' }) })
      );
    });

    it('a suspended creator cannot clear their own suspension by re-submitting', async () => {
      const { service, prisma } = build({ approvalStatus: 'SUSPENDED', reviewedById: 'admin' });
      await expect(service.apply('u1', dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.creatorProfile.update).not.toHaveBeenCalled();
    });

    it("the applicant's save is conditional on the decision it was computed against", async () => {
      const { service, prisma } = build({ approvalStatus: 'PENDING' });
      await service.apply('u1', dto);
      expect(prisma.creatorProfile.update.mock.calls[0][0].where).toEqual({ userId: 'u1', approvalStatus: 'PENDING' });
    });

    it('an applicant whose application was reviewed mid-edit is told, not silently discarded', async () => {
      const { service, prisma } = build({ approvalStatus: 'PENDING' });
      prisma.creatorProfile.update.mockRejectedValue(raceLost);
      await expect(service.apply('u1', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-race failure on the applicant path', async () => {
      const { service, prisma } = build({ approvalStatus: 'PENDING' });
      prisma.creatorProfile.update.mockRejectedValue(new Error('db down'));
      await expect(service.apply('u1', dto)).rejects.toThrow('db down');
    });

    it('a reviewer deciding against a stale view of the application is refused', async () => {
      const { service, prisma } = build();
      prisma.creatorProfile.update.mockRejectedValue(raceLost);
      await expect(service.approveCreator('admin', 'u1', 'PENDING' as any)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a non-race failure on the reviewer path', async () => {
      const { service, prisma } = build();
      prisma.creatorProfile.update.mockRejectedValue(new Error('db down'));
      await expect(service.approveCreator('admin', 'u1', 'PENDING' as any)).rejects.toThrow('db down');
    });

    it('each decision carries the expected status when the reviewer supplies one', async () => {
      const { service, prisma } = build();
      await service.approveCreator('admin', 'u1', 'PENDING' as any);
      await service.rejectCreator('admin', 'u2', 'no', 'PENDING' as any);
      await service.suspendCreator('admin', 'u3', 'abuse', 'APPROVED' as any);
      const wheres = prisma.creatorProfile.update.mock.calls.map((c: any[]) => c[0].where);
      expect(wheres).toEqual([
        { userId: 'u1', approvalStatus: 'PENDING' },
        { userId: 'u2', approvalStatus: 'PENDING' },
        { userId: 'u3', approvalStatus: 'APPROVED' }
      ]);
    });
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

  it('setPayoutEligibility(enabled) sets payoutEnabled + KYC APPROVED + audit', async () => {
    const { service, prisma } = build();
    await service.setPayoutEligibility('admin', 'u1', true);
    expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payoutEnabled: true, kycStatus: 'APPROVED' }) })
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_PAYOUT_ENABLED' }) })
    );
  });

  it('setPayoutEligibility(disabled) flips only payoutEnabled, leaves KYC + audit', async () => {
    const { service, prisma } = build();
    await service.setPayoutEligibility('admin', 'u1', false);
    const data = prisma.creatorProfile.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ payoutEnabled: false });
    expect(data.kycStatus).toBeUndefined();
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATOR_PAYOUT_DISABLED' }) })
    );
  });
});

// A deliberate, flagged weakening of the review gate. These pin that it is OFF
// unless asked for, that it never rescues a suspended creator, and that the
// trail it writes never implies a human reviewed anything.
describe('CreatorsService beta auto-approval', () => {
  const FLAG = 'BETA_AUTO_APPROVE_CREATORS';
  afterEach(() => { delete process.env[FLAG]; });

  it('is off by default — a first application still lands PENDING', async () => {
    const { service, prisma } = build();
    const res: any = await service.apply('u1', dto);
    expect(res.approvalStatus).toBe('PENDING');
    expect(prisma.user.update).not.toHaveBeenCalled(); // no promotion
  });

  it('approves and promotes a first-time applicant when enabled', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build();
    await service.apply('u1', dto);
    expect(prisma.creatorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ approvalStatus: 'APPROVED' }) })
    );
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'CREATOR' } }));
  });

  it('attributes the approval to a non-human actor, not to the applicant', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build();
    await service.apply('u1', dto);
    const audit = prisma.adminAuditLog.create.mock.calls.map((c: any[]) => c[0].data);
    const auto = audit.find((d: any) => d.action === 'CREATOR_AUTO_APPROVED');
    expect(auto).toBeDefined();
    expect(auto.actorId).toBe('system:beta-auto-approve');
    expect(auto.actorId).not.toBe('u1');
    expect(auto.metadata.reason).toBe('BETA_AUTO_APPROVE_CREATORS');
  });

  it('approves a rejected applicant who re-applies', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build({ approvalStatus: 'REJECTED', reviewedById: 'admin' });
    await service.apply('u1', dto);
    const statuses = prisma.creatorProfile.update.mock.calls.map((c: any[]) => c[0].data.approvalStatus);
    expect(statuses).toContain('APPROVED');
  });

  it('approves a pending applicant who amends their application', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build({ approvalStatus: 'PENDING' });
    await service.apply('u1', dto);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: 'CREATOR' } }));
  });

  // The flag is a queue shortcut, not an amnesty.
  it('never rescues a suspended creator', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build({ approvalStatus: 'SUSPENDED' });
    await expect(service.apply('u1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('does not re-approve or re-promote an already-approved creator amending details', async () => {
    process.env[FLAG] = 'true';
    const { service, prisma } = build({ approvalStatus: 'APPROVED', reviewedById: 'admin' });
    await service.apply('u1', { ...dto, stageName: 'Renamed' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    const audit = prisma.adminAuditLog.create.mock.calls.map((c: any[]) => c[0].data.action);
    expect(audit).not.toContain('CREATOR_AUTO_APPROVED');
  });

  it('treats any value other than the literal "true" as off', async () => {
    process.env[FLAG] = 'yes';
    const { service, prisma } = build();
    await service.apply('u1', dto);
    expect(prisma.user.update).not.toHaveBeenCalled();
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
  return { service: new CreatorsService(prisma, wallet, new AggregationService(prisma)), prisma, wallet };
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
    // published 💎→fiat rate + currency (env defaults) for the web earnings view
    expect(res).toMatchObject({ payoutRate: 100, payoutCurrency: 'NGN' });
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
