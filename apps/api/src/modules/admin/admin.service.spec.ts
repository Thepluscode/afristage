import { AggregationService } from '../aggregation/aggregation.service';
import { AdminService } from './admin.service';

function build(giftSum: number | null = null) {
  const count = jest.fn().mockResolvedValue(0);
  const prisma: any = {
    liveRoom: { count, findMany: jest.fn().mockResolvedValue([]) },
    creatorProfile: { count, findMany: jest.fn().mockResolvedValue([]) },
    report: { count },
    payoutRequest: { count },
    supportTicket: { count },
    paymentIntent: { count, findMany: jest.fn().mockResolvedValue([]) },
    user: { count, findMany: jest.fn().mockResolvedValue([]) },
    giftTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalCoinAmount: giftSum } }) },
    ledgerTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    adminAuditLog: { findMany: jest.fn().mockResolvedValue([]) }
  };
  return { service: new AdminService(prisma, new AggregationService(prisma)), prisma };
}

describe('AdminService dashboards', () => {
  it('betaOpsDashboard returns the full ops snapshot', async () => {
    const { service } = build();
    const res = await service.betaOpsDashboard();
    expect(Object.keys(res)).toEqual(
      expect.arrayContaining(['activeRooms', 'pendingCreatorApprovals', 'criticalReports', 'pendingPayouts', 'bannedUsers'])
    );
  });

  it('dashboard coerces a null gift sum to "0"', async () => {
    const { service } = build(null);
    const res = await service.dashboard();
    expect(res.grossGiftVolumeCoins).toBe('0');
  });

  it('dashboard stringifies a non-null gift sum', async () => {
    const { service } = build(4200);
    const res = await service.dashboard();
    expect(res.grossGiftVolumeCoins).toBe('4200');
  });
});

describe('AdminService.users (filter building)', () => {
  it('queries with no WHERE when no filters are supplied', async () => {
    const { service, prisma } = build();
    await service.users();
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('builds an AND across query, status, and role filters', async () => {
    const { service, prisma } = build();
    await service.users('ada', 'ACTIVE', 'CREATOR');
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(3);
    expect(where.AND).toEqual(
      expect.arrayContaining([{ status: 'ACTIVE' }, { role: 'CREATOR' }])
    );
  });
});

describe('AdminService list filters', () => {
  it('creators() filters by approvalStatus when provided', async () => {
    const { service, prisma } = build();
    await service.creators('APPROVED');
    expect(prisma.creatorProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { approvalStatus: 'APPROVED' } })
    );
  });

  it('creators() uses an empty filter when none provided', async () => {
    const { service, prisma } = build();
    await service.creators();
    expect(prisma.creatorProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('liveRooms() filters by status when provided, else lists all', async () => {
    const { service, prisma } = build();
    await service.liveRooms('LIVE');
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'LIVE' } }));
    await service.liveRooms();
    expect(prisma.liveRoom.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('payments/ledgerTransactions/auditLogs return bounded recent lists', async () => {
    const { service } = build();
    await expect(service.payments()).resolves.toEqual([]);
    await expect(service.ledgerTransactions()).resolves.toEqual([]);
    await expect(service.auditLogs()).resolves.toEqual([]);
  });
});

describe('AdminService.leaderboard', () => {
  function lbBuild(rows: any[] = [], users: any[] = []) {
    const prisma: any = {
      giftTransaction: { groupBy: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue(users) }
    };
    return { service: new AdminService(prisma, new AggregationService(prisma)), prisma };
  }

  it('ranks top creators (default), resolves labels through every fallback, and windows by week', async () => {
    const { service, prisma } = lbBuild(
      [
        { creatorId: 'c1', _sum: { totalCoinAmount: 500 } },
        { creatorId: 'c2', _sum: { totalCoinAmount: 400 } },
        { creatorId: 'c2b', _sum: { totalCoinAmount: 300 } },
        { creatorId: 'c3', _sum: { totalCoinAmount: 200 } },
        { creatorId: 'c4', _sum: { totalCoinAmount: null } }
      ],
      [
        { id: 'c1', creatorProfile: { stageName: 'Nova' }, profile: { displayName: 'N D', username: 'nd' }, email: 'n@x' },
        { id: 'c2', creatorProfile: null, profile: { displayName: 'Dee', username: 'dee' }, email: 'd@x' },
        { id: 'c2b', creatorProfile: null, profile: { displayName: '', username: 'un2b' }, email: 'e2b@x' },
        { id: 'c3', creatorProfile: null, profile: null, email: 'e3@x' }
        // c4 has no user row -> id fallback
      ]
    );
    const res = await service.leaderboard(); // creator / week / 20
    expect(res[0]).toEqual({ rank: 1, userId: 'c1', label: 'Nova', totalCoins: 500 });
    expect(res[1].label).toBe('Dee'); // no stageName -> displayName
    expect(res[2].label).toBe('un2b'); // empty displayName -> username
    expect(res[3].label).toBe('e3@x'); // no profile -> email
    expect(res[4]).toEqual({ rank: 5, userId: 'c4', label: 'c4', totalCoins: 0 }); // missing user + null sum
    expect(prisma.giftTransaction.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['creatorId'], where: { createdAt: { gte: expect.any(Date) } }, take: 20 })
    );
  });

  it('ranks top supporters over all-time with supporter label fallbacks', async () => {
    const { service, prisma } = lbBuild(
      [
        { viewerId: 'v1', _sum: { totalCoinAmount: 90 } },
        { viewerId: 'v2', _sum: { totalCoinAmount: 80 } },
        { viewerId: 'v3', _sum: { totalCoinAmount: 70 } },
        { viewerId: 'v4', _sum: { totalCoinAmount: 60 } }
      ],
      [
        { id: 'v1', profile: { displayName: 'Ada', username: 'ada' }, email: 'a@x' },
        { id: 'v2', profile: { displayName: '', username: 'un2' }, email: 'e2@x' },
        { id: 'v3', profile: null, email: 'e3@x' }
      ]
    );
    const res = await service.leaderboard('supporter', 'all');
    expect(res.map((r) => r.label)).toEqual(['Ada', 'un2', 'e3@x', 'v4']);
    expect(prisma.giftTransaction.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['viewerId'], where: {} }));
  });

  it('supports the day window and clamps the limit to 100', async () => {
    const { service, prisma } = lbBuild([], []);
    await service.leaderboard('creator', 'day', 500);
    const call = prisma.giftTransaction.groupBy.mock.calls[0][0];
    expect(call.take).toBe(100);
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
    // a falsy limit falls back to the default 20
    await service.leaderboard('creator', 'day', 0);
    expect(prisma.giftTransaction.groupBy.mock.calls[1][0].take).toBe(20);
    await expect(service.leaderboard('creator', 'day', 500)).resolves.toEqual([]);
  });
});

describe('AdminService.search', () => {
  function searchBuild(
    data: { users?: any[]; creators?: any[]; rooms?: any[]; reports?: any[]; payments?: any[]; payouts?: any[]; gifts?: any[]; tickets?: any[] } = {}
  ) {
    const prisma: any = {
      user: { findMany: jest.fn().mockResolvedValue(data.users ?? []) },
      creatorProfile: { findMany: jest.fn().mockResolvedValue(data.creators ?? []) },
      liveRoom: { findMany: jest.fn().mockResolvedValue(data.rooms ?? []) },
      report: { findMany: jest.fn().mockResolvedValue(data.reports ?? []) },
      paymentIntent: { findMany: jest.fn().mockResolvedValue(data.payments ?? []) },
      payoutRequest: { findMany: jest.fn().mockResolvedValue(data.payouts ?? []) },
      gift: { findMany: jest.fn().mockResolvedValue(data.gifts ?? []) },
      supportTicket: { findMany: jest.fn().mockResolvedValue(data.tickets ?? []) }
    };
    return { service: new AdminService(prisma, new AggregationService(prisma)), prisma };
  }

  it('returns an empty list without querying when q is blank or missing', async () => {
    const { service, prisma } = searchBuild();
    await expect(service.search()).resolves.toEqual([]);
    await expect(service.search('   ')).resolves.toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('trims the term and queries every entity case-insensitively', async () => {
    const { service, prisma } = searchBuild();
    await service.search('  Ada  ');
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ email: { contains: 'Ada', mode: 'insensitive' } }, { phone: { contains: 'Ada' } }])
    );
    expect(prisma.liveRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { title: { contains: 'Ada', mode: 'insensitive' } } }));
    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { details: { contains: 'Ada', mode: 'insensitive' } } }));
    expect(prisma.gift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { name: { contains: 'Ada', mode: 'insensitive' } } }));
    expect(prisma.creatorProfile.findMany).toHaveBeenCalled();
    expect(prisma.supportTicket.findMany).toHaveBeenCalled();
    expect(prisma.payoutRequest.findMany).toHaveBeenCalled();
  });

  it('maps results across types with every label/sublabel fallback', async () => {
    const { service } = searchBuild({
      users: [
        { id: 'u1', role: 'ADMIN', email: 'e1', phone: 'p1', profile: { displayName: 'Display One', username: 'un1' } },
        { id: 'u2', role: 'CREATOR', email: 'e2', phone: 'p2', profile: { displayName: '', username: 'un2' } },
        { id: 'u3', role: 'MODERATOR', email: 'e3', phone: null, profile: null },
        { id: 'u4', role: 'VIEWER', email: null, phone: 'p4', profile: null },
        { id: 'u5', role: 'VIEWER', email: null, phone: null, profile: null }
      ],
      creators: [{ id: 'c1', stageName: 'Nova', approvalStatus: 'APPROVED' }],
      rooms: [{ id: 'r1', title: 'Friday Night', status: 'LIVE' }],
      reports: [{ id: 'rp1', reason: 'HARASSMENT', status: 'OPEN' }],
      payments: [
        { id: 'pm1', providerReference: 'pref1', status: 'SUCCEEDED', coinAmount: 100 },
        { id: 'pm2', providerReference: null, status: 'PENDING', coinAmount: 50 }
      ],
      payouts: [
        { id: 'po1', payoutDestinationReference: 'dest1', providerReference: null, status: 'APPROVED' },
        { id: 'po2', payoutDestinationReference: null, providerReference: 'prov2', status: 'PAID' },
        { id: 'po3', payoutDestinationReference: null, providerReference: null, status: 'HELD' }
      ],
      gifts: [
        { id: 'g1', name: 'Rose', isActive: true },
        { id: 'g2', name: 'Fire', isActive: false }
      ],
      tickets: [{ id: 't1', subject: 'Cannot withdraw', status: 'OPEN' }]
    });
    const res = await service.search('x');
    const byId = Object.fromEntries(res.map((r) => [r.id, r]));
    // user label fallbacks: displayName -> username -> email -> phone -> id; href carries the record id
    expect(byId.u1).toMatchObject({ type: 'user', label: 'Display One', sublabel: 'e1', href: '/users?id=u1' });
    expect(byId.u2.label).toBe('un2');
    expect(byId.u3.label).toBe('e3');
    expect(byId.u4.label).toBe('p4');
    expect(byId.u5).toMatchObject({ label: 'u5', sublabel: 'VIEWER' });
    // room
    expect(byId.r1).toMatchObject({ type: 'room', label: 'Friday Night', sublabel: 'LIVE', href: '/live-rooms?id=r1' });
    // payment label: providerReference -> id; sublabel composes status + coins
    expect(byId.pm1).toMatchObject({ type: 'payment', label: 'pref1', sublabel: 'SUCCEEDED · 100 coins', href: '/payments?id=pm1' });
    expect(byId.pm2.label).toBe('pm2');
    // payout label: destinationReference -> providerReference -> id
    expect(byId.po1).toMatchObject({ type: 'payout', label: 'dest1', href: '/payouts?id=po1' });
    expect(byId.po2.label).toBe('prov2');
    expect(byId.po3.label).toBe('po3');
    // new entity types
    expect(byId.c1).toMatchObject({ type: 'creator', label: 'Nova', sublabel: 'APPROVED', href: '/creators?id=c1' });
    expect(byId.rp1).toMatchObject({ type: 'report', label: 'HARASSMENT', sublabel: 'OPEN', href: '/reports?id=rp1' });
    expect(byId.g1).toMatchObject({ type: 'gift', label: 'Rose', sublabel: 'active', href: '/gifts?id=g1' });
    expect(byId.g2.sublabel).toBe('inactive'); // isActive false branch
    expect(byId.t1).toMatchObject({ type: 'ticket', label: 'Cannot withdraw', sublabel: 'OPEN', href: '/support?id=t1' });
  });
});
