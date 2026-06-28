import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SupportService } from './support.service';

function build(ticket: any) {
  const prisma: any = {
    supportTicket: { findUnique: jest.fn().mockResolvedValue(ticket), update: jest.fn().mockResolvedValue({}) },
    supportTicketMessage: { create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve(data)) }
  };
  return { service: new SupportService(prisma), prisma };
}

const ticket = {
  id: 't1',
  requesterId: 'owner',
  messages: [
    { id: 'm1', message: 'hi', internal: false },
    { id: 'm2', message: 'internal note', internal: true }
  ]
};

describe('SupportService', () => {
  it('hides internal messages from the requester', async () => {
    const { service } = build(ticket);
    const res = await service.getTicket('owner', UserRole.VIEWER, 't1');
    expect(res.messages.map((m: any) => m.id)).toEqual(['m1']);
  });

  it('shows internal messages to an admin', async () => {
    const { service } = build(ticket);
    const res = await service.getTicket('admin', UserRole.ADMIN, 't1');
    expect(res.messages.map((m: any) => m.id)).toEqual(['m1', 'm2']);
  });

  it('blocks a non-owner non-admin from viewing a ticket', async () => {
    const { service } = build(ticket);
    await expect(service.getTicket('intruder', UserRole.VIEWER, 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forces internal=false for a requester message even if requested', async () => {
    const { service, prisma } = build(ticket);
    await service.addMessage('owner', UserRole.VIEWER, 't1', 'hello', true);
    expect(prisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ internal: false }) })
    );
  });

  it('honours internal=true for an admin', async () => {
    const { service, prisma } = build(ticket);
    await service.addMessage('admin', UserRole.ADMIN, 't1', 'note', true);
    expect(prisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ internal: true }) })
    );
  });

  it('reopens a resolved ticket when the requester replies', async () => {
    const { service, prisma } = build({ id: 't1', requesterId: 'owner', status: 'RESOLVED' });
    await service.addMessage('owner', UserRole.VIEWER, 't1', 'still broken', false);
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't1' }, data: { status: 'OPEN', resolvedAt: null } })
    );
  });

  it('does not reopen when an admin replies to a resolved ticket', async () => {
    const { service, prisma } = build({ id: 't1', requesterId: 'owner', status: 'RESOLVED' });
    await service.addMessage('admin', UserRole.ADMIN, 't1', 'closing note', false);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });

  it('does not change status when the requester replies to an open ticket', async () => {
    const { service, prisma } = build({ id: 't1', requesterId: 'owner', status: 'OPEN' });
    await service.addMessage('owner', UserRole.VIEWER, 't1', 'more info', false);
    expect(prisma.supportTicket.update).not.toHaveBeenCalled();
  });
});

describe('SupportService error paths', () => {
  it('getTicket throws NotFound for a missing ticket', async () => {
    const { service } = build(null);
    await expect(service.getTicket('owner', UserRole.VIEWER, 't1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('addMessage throws NotFound for a missing ticket', async () => {
    const { service } = build(null);
    await expect(service.addMessage('owner', UserRole.VIEWER, 't1', 'hi')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('addMessage forbids a non-owner non-admin', async () => {
    const { service } = build({ id: 't1', requesterId: 'someone-else', status: 'OPEN' });
    await expect(service.addMessage('intruder', UserRole.VIEWER, 't1', 'hi')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SupportService CRUD', () => {
  it('createTicket persists the requester + fields', async () => {
    const { service, prisma } = build(null);
    prisma.supportTicket.create = jest.fn().mockResolvedValue({ id: 't1' });
    await service.createTicket('u1', { type: 'PAYMENT', subject: 'S', description: 'D' } as any);
    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requesterId: 'u1', type: 'PAYMENT', subject: 'S' }) })
    );
  });

  it('myTickets lists a requester’s tickets', async () => {
    const { service, prisma } = build(null);
    prisma.supportTicket.findMany = jest.fn().mockResolvedValue([]);
    await service.myTickets('u1');
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { requesterId: 'u1' } }));
  });

  it('adminList lists all tickets by priority then recency', async () => {
    const { service, prisma } = build(null);
    prisma.supportTicket.findMany = jest.fn().mockResolvedValue([]);
    await service.adminList();
    expect(prisma.supportTicket.findMany).toHaveBeenCalled();
  });

  it('assign sets the admin + IN_REVIEW', async () => {
    const { service, prisma } = build(null);
    await service.assign('admin', 't1');
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedAdminId: 'admin', status: 'IN_REVIEW' }) })
    );
  });

  it('resolve sets RESOLVED + resolvedAt', async () => {
    const { service, prisma } = build(null);
    await service.resolve('t1');
    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESOLVED' }) })
    );
  });
});
