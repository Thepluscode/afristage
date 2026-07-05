import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ModerationService } from './moderation.service';

function build(target?: { role: string }) {
  const prisma: any = {
    report: {
      create: jest.fn().mockResolvedValue({ id: 'rep1', status: 'OPEN' }),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'rep1', ...data }))
    },
    user: { update: jest.fn(), findUnique: jest.fn().mockResolvedValue(target ?? { id: 'u2', role: 'VIEWER' }) },
    liveRoom: { update: jest.fn() },
    moderationAction: { create: jest.fn().mockResolvedValue({}) },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
  };
  const liveRooms: any = { clearFeedCache: jest.fn() };
  return { service: new ModerationService(prisma, liveRooms), prisma, liveRooms };
}

describe('ModerationService', () => {
  it('creates a report (defaults to OPEN status)', async () => {
    const { service, prisma } = build();
    await service.report('reporter1', { targetUserId: 'u2', roomId: 'r1', reason: 'SPAM' } as any);
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reporterId: 'reporter1', reason: 'SPAM' }) })
    );
  });

  const priorityOf = async (reason: string, supplied?: string) => {
    const { service, prisma } = build();
    await service.report('r', { reason, priority: supplied } as any);
    return prisma.report.create.mock.calls[0][0].data.priority;
  };

  it('auto-prioritises safety reasons', async () => {
    expect(await priorityOf('UNDERAGE_RISK')).toBe('CRITICAL');
    expect(await priorityOf('SELF_HARM')).toBe('CRITICAL');
    expect(await priorityOf('VIOLENCE')).toBe('CRITICAL');
    expect(await priorityOf('SCAM')).toBe('HIGH');
    expect(await priorityOf('PAYMENT_FRAUD')).toBe('HIGH');
    expect(await priorityOf('SPAM')).toBe('MEDIUM');
    expect(await priorityOf('SPAM', 'LOW')).toBe('LOW'); // explicit overrides
  });

  it('ESCALATE sets status REVIEWING and bumps priority to CRITICAL', async () => {
    const { service, prisma } = build();
    await service.action('mod', 'rep1', 'ESCALATE');
    const data = prisma.report.update.mock.calls[0][0].data;
    expect(data).toEqual({ status: 'REVIEWING', priority: 'CRITICAL' });
  });

  it('DISMISS maps to REJECTED status', async () => {
    const { service, prisma } = build();
    await service.action('mod', 'rep1', 'DISMISS');
    expect(prisma.report.update.mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('a MODERATOR cannot ban a staff account; SUPER_ADMIN can', async () => {
    const staff = build({ role: 'ADMIN' });
    await expect(staff.service.banUser('mod', 'admin2', 'x', UserRole.MODERATOR)).rejects.toBeInstanceOf(ForbiddenException);
    const sa = build({ role: 'ADMIN' });
    sa.prisma.user.update.mockResolvedValue({ id: 'admin2', status: 'BANNED' });
    await expect(sa.service.banUser('boss', 'admin2', 'x', UserRole.SUPER_ADMIN)).resolves.toMatchObject({ status: 'BANNED' });
  });

  it('reactivate sets status ACTIVE', async () => {
    const { service, prisma } = build();
    prisma.user.update.mockResolvedValue({ id: 'u2', status: 'ACTIVE' });
    await service.reactivateUser('admin', 'u2');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'ACTIVE' } }));
  });

  it('suspends a user (status SUSPENDED + action + audit)', async () => {
    const { service, prisma } = build();
    prisma.user.update.mockResolvedValue({ id: 'u2', status: 'SUSPENDED' });
    await service.suspendUser('admin', 'u2', 'abuse');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SUSPENDED' } }));
    expect(prisma.moderationAction.create).toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
  });

  it('bans a user (status BANNED)', async () => {
    const { service, prisma } = build();
    prisma.user.update.mockResolvedValue({ id: 'u2', status: 'BANNED' });
    await service.banUser('admin', 'u2');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'BANNED' } }));
  });

  it('suspends a room (status SUSPENDED + endedAt + audit) and clears the feed cache', async () => {
    const { service, prisma, liveRooms } = build();
    prisma.liveRoom.update.mockResolvedValue({ id: 'r1', status: 'SUSPENDED' });
    await service.suspendRoom('admin', 'r1', 'tos');
    const call = prisma.liveRoom.update.mock.calls[0][0];
    expect(call.data.status).toBe('SUSPENDED');
    expect(call.data.endedAt).toBeInstanceOf(Date);
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
    // a suspended room must never be served from a stale feed slice
    expect(liveRooms.clearFeedCache).toHaveBeenCalled();
  });
});

describe('ModerationService reports + action default', () => {
  function rich() {
    const prisma: any = {
      report: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'rep1', ...data })) },
      moderationAction: { create: jest.fn().mockResolvedValue({}) },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const liveRooms: any = { clearFeedCache: jest.fn() };
  return { service: new ModerationService(prisma, liveRooms), prisma, liveRooms };
  }

  it('reports() applies status/priority/reason filters', async () => {
    const { service, prisma } = rich();
    await service.reports({ status: 'OPEN', priority: 'HIGH', reason: 'SPAM' });
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN', priority: 'HIGH', reason: 'SPAM' } })
    );
  });

  it('reports() uses an empty filter when none supplied', async () => {
    const { service, prisma } = rich();
    await service.reports();
    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('an unrecognised action verb maps to ACTIONED', async () => {
    const { service, prisma } = rich();
    await service.action('mod', 'rep1', 'WARN');
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIONED' }) })
    );
  });
});

describe('ModerationService action/audit edge branches', () => {
  function rich() {
    const prisma: any = {
      report: { update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'rep1', ...data })) },
      moderationAction: { create: jest.fn().mockResolvedValue({}) },
      adminAuditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const liveRooms: any = { clearFeedCache: jest.fn() };
  return { service: new ModerationService(prisma, liveRooms), prisma, liveRooms };
  }

  it('REVIEWING action maps to REVIEWING status', async () => {
    const { service, prisma } = rich();
    await service.action('mod', 'rep1', 'REVIEWING');
    expect(prisma.report.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REVIEWING' }) }));
  });

  it('audit defaults metadata to an empty object when omitted', async () => {
    const { service, prisma } = rich();
    await service.audit('mod', 'some.action', 'target1');
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: {} }) }));
  });
});
