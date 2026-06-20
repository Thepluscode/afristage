import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.supportTicketMessage.create({
      data: { ticketId, senderId: userId, message, internal: isAdmin ? internal : false }
    });
  }

  adminList() {
    return this.prisma.supportTicket.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
  }

  assign(adminId: string, id: string) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { assignedAdminId: adminId, status: SupportTicketStatus.IN_REVIEW }
    });
  }

  resolve(id: string) {
    return this.prisma.supportTicket.update({
      where: { id },
      data: { status: SupportTicketStatus.RESOLVED, resolvedAt: new Date() }
    });
  }
}
