import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { SupportService } from './support.service';
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto';
import { AddMessageDto } from './dto/add-message.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('support/tickets')
  create(@CurrentUser() user: any, @Body() dto: CreateSupportTicketDto) {
    return this.support.createTicket(user.sub, dto);
  }

  @Get('support/tickets/me')
  mine(@CurrentUser() user: any) {
    return this.support.myTickets(user.sub);
  }

  @Get('support/tickets/:id')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicket(user.sub, user.role, id);
  }

  @Post('support/tickets/:id/messages')
  addMessage(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddMessageDto) {
    return this.support.addMessage(user.sub, user.role, id, dto.message, dto.internal);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/support/tickets')
  adminList() {
    return this.support.adminList();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/support/tickets/:id/assign')
  assign(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.assign(user.sub, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/support/tickets/:id/resolve')
  resolve(@Param('id') id: string) {
    return this.support.resolve(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/support/tickets/:id/messages')
  adminMessage(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: AddMessageDto) {
    return this.support.addMessage(user.sub, user.role, id, dto.message, dto.internal);
  }
}
