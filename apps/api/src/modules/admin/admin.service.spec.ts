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
  return { service: new AdminService(prisma), prisma };
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

describe('AdminService.search', () => {
  function searchBuild(data: { users?: any[]; rooms?: any[]; payments?: any[]; payouts?: any[] } = {}) {
    const prisma: any = {
      user: { findMany: jest.fn().mockResolvedValue(data.users ?? []) },
      liveRoom: { findMany: jest.fn().mockResolvedValue(data.rooms ?? []) },
      paymentIntent: { findMany: jest.fn().mockResolvedValue(data.payments ?? []) },
      payoutRequest: { findMany: jest.fn().mockResolvedValue(data.payouts ?? []) }
    };
    return { service: new AdminService(prisma), prisma };
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
      rooms: [{ id: 'r1', title: 'Friday Night', status: 'LIVE' }],
      payments: [
        { id: 'pm1', providerReference: 'pref1', status: 'SUCCEEDED', coinAmount: 100 },
        { id: 'pm2', providerReference: null, status: 'PENDING', coinAmount: 50 }
      ],
      payouts: [
        { id: 'po1', payoutDestinationReference: 'dest1', providerReference: null, status: 'APPROVED' },
        { id: 'po2', payoutDestinationReference: null, providerReference: 'prov2', status: 'PAID' },
        { id: 'po3', payoutDestinationReference: null, providerReference: null, status: 'HELD' }
      ]
    });
    const res = await service.search('x');
    const byId = Object.fromEntries(res.map((r) => [r.id, r]));
    // user label fallbacks: displayName -> username -> email -> phone -> id
    expect(byId.u1).toMatchObject({ type: 'user', label: 'Display One', sublabel: 'e1', href: '/users' });
    expect(byId.u2.label).toBe('un2');
    expect(byId.u3.label).toBe('e3');
    expect(byId.u4.label).toBe('p4');
    expect(byId.u5).toMatchObject({ label: 'u5', sublabel: 'VIEWER' });
    // room
    expect(byId.r1).toMatchObject({ type: 'room', label: 'Friday Night', sublabel: 'LIVE', href: '/live-rooms' });
    // payment label: providerReference -> id; sublabel composes status + coins
    expect(byId.pm1).toMatchObject({ type: 'payment', label: 'pref1', sublabel: 'SUCCEEDED · 100 coins', href: '/payments' });
    expect(byId.pm2.label).toBe('pm2');
    // payout label: destinationReference -> providerReference -> id
    expect(byId.po1).toMatchObject({ type: 'payout', label: 'dest1', href: '/payouts' });
    expect(byId.po2.label).toBe('prov2');
    expect(byId.po3.label).toBe('po3');
  });
});
