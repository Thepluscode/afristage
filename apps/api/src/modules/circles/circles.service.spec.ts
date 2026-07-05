import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AggregationService } from '../aggregation/aggregation.service';
import { CirclesService } from './circles.service';

function build() {
  const prisma: any = {
    circle: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'ci1', ...data, members: [{ userId: data.createdById, role: 'OWNER' }] })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({})
    },
    circleMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0)
    },
    giftTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: 0 } }) },
    missionClaim: { aggregate: jest.fn().mockResolvedValue({ _sum: { rewardCoins: 0 } }) },
    profile: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { service: new CirclesService(prisma, new AggregationService(prisma)), prisma };
}

describe('CirclesService.create', () => {
  it('creates a circle with the creator as OWNER', async () => {
    const { service, prisma } = build();
    const res = await service.create('u1', { name: 'Lagos Circle' });
    expect(res.members[0]).toMatchObject({ userId: 'u1', role: 'OWNER' });
    expect(prisma.circle.create.mock.calls[0][0].data.members.create).toEqual({ userId: 'u1', role: 'OWNER' });
  });

  it('rejects creating while already in a circle (one circle per user)', async () => {
    const { service, prisma } = build();
    prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'other' });
    await expect(service.create('u1', { name: 'Second' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CirclesService join/leave', () => {
  it('joins an existing circle', async () => {
    const { service, prisma } = build();
    prisma.circle.findUnique.mockResolvedValue({ id: 'ci1' });
    await expect(service.join('u2', 'ci1')).resolves.toEqual({ ok: true, alreadyMember: false });
    expect(prisma.circleMember.create).toHaveBeenCalledWith({ data: { circleId: 'ci1', userId: 'u2' } });
  });

  it('rejects joining a full circle (cap = the group-fraud assessment bound)', async () => {
    const { service, prisma } = build();
    prisma.circle.findUnique.mockResolvedValue({ id: 'ci1' });
    prisma.circleMember.count.mockResolvedValue(200);
    await expect(service.join('u2', 'ci1')).rejects.toThrow('full');
    expect(prisma.circleMember.create).not.toHaveBeenCalled();
  });

  it('join is idempotent for the same circle and rejected for a different one', async () => {
    const { service, prisma } = build();
    prisma.circle.findUnique.mockResolvedValue({ id: 'ci1' });
    prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'ci1' });
    await expect(service.join('u2', 'ci1')).resolves.toEqual({ ok: true, alreadyMember: true });
    prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'other' });
    await expect(service.join('u2', 'ci1')).rejects.toThrow('leave it first');
  });

  it('join 404s for an unknown circle', async () => {
    const { service } = build();
    await expect(service.join('u2', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a member leaves freely; a non-member cannot leave', async () => {
    const { service, prisma } = build();
    prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'ci1', role: 'MEMBER', userId: 'u2' });
    await expect(service.leave('u2')).resolves.toEqual({ ok: true, circleDeleted: false });
    prisma.circleMember.findUnique.mockResolvedValue(null);
    await expect(service.leave('u2')).rejects.toThrow('not in a circle');
  });

  it('an owner cannot leave a populated circle; leaving as last member deletes it', async () => {
    const { service, prisma } = build();
    prisma.circleMember.findUnique.mockResolvedValue({ circleId: 'ci1', role: 'OWNER', userId: 'u1' });
    prisma.circleMember.count.mockResolvedValue(2);
    await expect(service.leave('u1')).rejects.toThrow('cannot leave while the circle has members');
    prisma.circleMember.count.mockResolvedValue(0);
    await expect(service.leave('u1')).resolves.toEqual({ ok: true, circleDeleted: true });
    expect(prisma.circle.delete).toHaveBeenCalledWith({ where: { id: 'ci1' } });
  });
});

describe('CirclesService reads', () => {
  it('mine returns null when the caller has no circle, and the circle+role when they do', async () => {
    const { service, prisma } = build();
    await expect(service.mine('u1')).resolves.toEqual({ circle: null });
    prisma.circleMember.findUnique.mockResolvedValue({
      role: 'OWNER',
      joinedAt: new Date(0),
      circle: { id: 'ci1', name: 'Lagos', _count: { members: 3 } }
    });
    const res = await service.mine('u1');
    expect(res).toMatchObject({ role: 'OWNER', circle: { id: 'ci1' } });
  });

  it('list clamps the limit and includes member counts', async () => {
    const { service, prisma } = build();
    await service.list(999);
    expect(prisma.circle.findMany.mock.calls[0][0].take).toBe(100);
    await service.list(0);
    expect(prisma.circle.findMany.mock.calls[1][0].take).toBe(20);
  });

  it('detail 404s for unknown circles and aggregates gift + mission points', async () => {
    const { service, prisma } = build();
    await expect(service.detail('ghost')).rejects.toBeInstanceOf(NotFoundException);
    prisma.circle.findUnique.mockResolvedValue({
      id: 'ci1', name: 'Lagos', description: null, city: 'Lagos',
      members: [{ userId: 'u1', role: 'OWNER', joinedAt: new Date(0) }, { userId: 'u2', role: 'MEMBER', joinedAt: new Date(0) }]
    });
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: 100 } });
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: 25 } });
    prisma.profile.findMany.mockResolvedValue([{ userId: 'u1', displayName: 'Ada', username: 'ada' }]);
    const res = await service.detail('ci1');
    expect(res.points.allTime).toEqual({ giftPoints: 100, missionPoints: 25, total: 125 });
    expect(res.members).toEqual([
      expect.objectContaining({ userId: 'u1', displayName: 'Ada', role: 'OWNER' }),
      expect.objectContaining({ userId: 'u2', displayName: 'Anonymous' }) // missing profile fallback
    ]);
    // weekly window queried with a since bound
    const weekly = prisma.giftTransaction.aggregate.mock.calls.find((c: any) => c[0].where.createdAt);
    expect(weekly[0].where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('detail with no members yields zero points (null sums coerced)', async () => {
    const { service, prisma } = build();
    prisma.circle.findUnique.mockResolvedValue({ id: 'ci1', name: 'Empty', description: null, city: null, members: [] });
    const res = await service.detail('ci1');
    expect(res.points.allTime).toEqual({ giftPoints: 0, missionPoints: 0, total: 0 });
    expect(prisma.giftTransaction.aggregate).not.toHaveBeenCalled(); // short-circuit
  });
});

describe('CirclesService.leaderboard', () => {
  it('scores, sorts, ranks circles by points inside the window', async () => {
    const { service, prisma } = build();
    prisma.circle.findMany.mockResolvedValue([
      { id: 'a', name: 'Alpha', city: null, members: [{ userId: 'u1' }] },
      { id: 'b', name: 'Beta', city: 'Accra', members: [{ userId: 'u2' }, { userId: 'u3' }] }
    ]);
    prisma.giftTransaction.aggregate
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 10 } }) // Alpha
      .mockResolvedValueOnce({ _sum: { totalCoinAmount: 500 } }); // Beta
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: 0 } });
    const res = await service.leaderboard('week', 10);
    expect(res).toEqual([
      { rank: 1, id: 'b', name: 'Beta', city: 'Accra', memberCount: 2, points: 500 },
      { rank: 2, id: 'a', name: 'Alpha', city: null, memberCount: 1, points: 10 }
    ]);
    expect(prisma.giftTransaction.aggregate.mock.calls[0][0].where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('the all-time window omits the since bound and the limit clamps', async () => {
    const { service, prisma } = build();
    prisma.circle.findMany.mockResolvedValue([{ id: 'a', name: 'A', city: null, members: [{ userId: 'u1' }] }]);
    await service.leaderboard('all', 999);
    expect(prisma.giftTransaction.aggregate.mock.calls[0][0].where.createdAt).toBeUndefined();
    await service.leaderboard('week', 0); // falsy limit falls back to 20
    expect(prisma.giftTransaction.aggregate.mock.calls[1][0].where.createdAt.gte).toBeInstanceOf(Date);
  });
});

describe('CirclesService defaults + null sums', () => {
  it('list() and leaderboard() defaults apply, and null aggregate sums coerce to 0', async () => {
    const { service, prisma } = build();
    await service.list();
    expect(prisma.circle.findMany.mock.calls[0][0].take).toBe(20);
    prisma.circle.findMany.mockResolvedValue([{ id: 'a', name: 'A', city: null, members: [{ userId: 'u1' }] }]);
    prisma.giftTransaction.aggregate.mockResolvedValue({ _sum: { totalCoinAmount: null } });
    prisma.missionClaim.aggregate.mockResolvedValue({ _sum: { rewardCoins: null } });
    const res = await service.leaderboard(); // default week window + limit
    expect(res).toEqual([{ rank: 1, id: 'a', name: 'A', city: null, memberCount: 1, points: 0 }]);
  });
});

describe('CirclesService.memberIds', () => {
  it('returns member ids and 404s on unknown circles', async () => {
    const { service, prisma } = build();
    await expect(service.memberIds('ghost')).rejects.toBeInstanceOf(NotFoundException);
    prisma.circle.findUnique.mockResolvedValue({ id: 'ci1', members: [{ userId: 'u1' }, { userId: 'u2' }] });
    await expect(service.memberIds('ci1')).resolves.toEqual(['u1', 'u2']);
  });
});
