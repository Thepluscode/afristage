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
