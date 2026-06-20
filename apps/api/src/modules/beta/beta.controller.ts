import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { BetaService } from './beta.service';
import { CreateBetaInviteDto } from './dto/create-beta-invite.dto';
import { AcceptBetaInviteDto } from './dto/accept-beta-invite.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class BetaController {
  constructor(private readonly beta: BetaService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/beta-invites')
  create(@CurrentUser() user: any, @Body() dto: CreateBetaInviteDto) {
    return this.beta.create(user.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/beta-invites')
  list() {
    return this.beta.list();
  }

  // Waitlist review queue (requests captured from the public landing form).
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/beta-requests')
  requests(@Query('status') status?: string) {
    return this.beta.listRequests(status);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/beta-invites/:id/revoke')
  revoke(@Param('id') id: string) {
    return this.beta.revoke(id);
  }

  @Post('beta/accept')
  accept(@CurrentUser() user: any, @Body() dto: AcceptBetaInviteDto) {
    return this.beta.accept(user.sub, dto.code);
  }
}
