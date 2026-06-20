import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateReportDto } from './dto/create-report.dto';
import { ModerationService } from './moderation.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post('reports')
  report(@CurrentUser() user: any, @Body() dto: CreateReportDto) {
    return this.moderation.report(user.sub, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/reports')
  reports(@Query('status') status?: string, @Query('priority') priority?: string, @Query('reason') reason?: string) {
    return this.moderation.reports({ status, priority, reason });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/reports/:id/action')
  action(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { action: string; reason?: string }) {
    return this.moderation.action(user.sub, id, body.action, body.reason);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/users/:id/suspend')
  suspendUser(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.suspendUser(user.sub, id, reason, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/users/:id/ban')
  banUser(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.banUser(user.sub, id, reason, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/users/:id/reactivate')
  reactivateUser(@CurrentUser() user: any, @Param('id') id: string) {
    return this.moderation.reactivateUser(user.sub, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/live-rooms/:id/suspend')
  suspendRoom(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.moderation.suspendRoom(user.sub, id, reason);
  }
}
