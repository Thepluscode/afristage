import { ForbiddenException } from '@nestjs/common';
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
