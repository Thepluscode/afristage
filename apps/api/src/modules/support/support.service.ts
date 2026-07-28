import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SupportTicketStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';

const ADMIN_ROLES: UserRole[] = [UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN];

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  createTicket(requesterId: string, dto: CreateSupportTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        requesterId,
        type: dto.type,
        subject: dto.subject,
        description: dto.description,
        relatedPaymentId: dto.relatedPaymentId,
        relatedPayoutId: dto.relatedPayoutId,
        relatedRoomId: dto.relatedRoomId
      }
    });
  }

  myTickets(requesterId: string) {
    return this.prisma.supportTicket.findMany({ where: { requesterId }, orderBy: { createdAt: 'desc' } });
  }

  // A user sees only their own ticket and never internal admin notes.
  async getTicket(userId: string, role: UserRole, id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: 'asc' } } } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const isAdmin = ADMIN_ROLES.includes(role);
    if (!isAdmin && ticket.requesterId !== userId) throw new ForbiddenException('Not your ticket');
    return { ...ticket, messages: ticket.messages.filter((m) => isAdmin || !m.internal) };
  }

  async addMessage(userId: string, role: UserRole, ticketId: string, message: string, internal = false) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const isAdmin = ADMIN_ROLES.includes(role);
    if (!isAdmin && ticket.requesterId !== userId) throw new ForbiddenException('Not your ticket');
    const created = await this.prisma.supportTicketMessage.create({
      data: { ticketId, senderId: userId, message, internal: isAdmin ? internal : false }
    });
    // A requester replying to a resolved/closed ticket reopens it so it returns
    // to the queue — otherwise the reply sits unseen and the user is stuck.
    if (!isAdmin && (ticket.status === SupportTicketStatus.RESOLVED || ticket.status === SupportTicketStatus.CLOSED)) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: SupportTicketStatus.OPEN, resolvedAt: null }
      });
    }
    return created;
  }

  adminList() {
    return this.prisma.supportTicket.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
  }

  // First admin to claim an unassigned ticket wins. An unconditional update let
  // the second admin's click silently overwrite the first, so two admins worked
  // the same ticket each believing it was theirs — the guard on assignedAdminId
  // makes the collision a 409 instead of a lost assignment. Re-claiming your own
  // ticket stays a no-op success.
  async assign(adminId: string, id: string) {
    const { count } = await this.prisma.supportTicket.updateMany({
      where: { id, OR: [{ assignedAdminId: null }, { assignedAdminId: adminId }] },
      data: { assignedAdminId: adminId, status: SupportTicketStatus.IN_REVIEW }
    });
    if (count === 0) {
      const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!ticket) throw new NotFoundException('Ticket not found');
      throw new ConflictException('Ticket is already assigned to another admin');
    }
    return this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
  }

  resolve(id: string) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: SupportTicketStatus.RESOLVED, resolvedAt: new Date() }
    });
  }
}
