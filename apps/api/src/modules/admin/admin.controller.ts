import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AdminService } from './admin.service';
import { CreatorsService } from '../creators/creators.service';
import { LedgerIntegrityService } from '../wallet/ledger-integrity.service';
import { LiveRoomsService } from '../live-rooms/live-rooms.service';

@UseGuards(JwtAuthGuard, RolesGuard)
// PAYOUT_REVIEWER is intentionally excluded here — its access is scoped to payout routes only.
@Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly creatorsService: CreatorsService,
    private readonly ledgerIntegrity: LedgerIntegrityService,
    private readonly liveRoomsService: LiveRoomsService
  ) {}

  @Get('beta-ops')
  betaOps() {
    return this.admin.betaOpsDashboard();
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('creators/:userId/approve')
  approveCreator(@CurrentUser() user: any, @Param('userId') userId: string) {
    return this.creatorsService.approveCreator(user.sub, userId);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('creators/:userId/reject')
  rejectCreator(@CurrentUser() user: any, @Param('userId') userId: string, @Body('reason') reason?: string) {
    return this.creatorsService.rejectCreator(user.sub, userId, reason || 'Rejected');
  }

  @Get('ledger/integrity')
  ledgerIntegrityCheck() {
    return this.ledgerIntegrity.check();
  }

  @Post('live-rooms/end-stale')
  endStaleRooms(@Body('maxIdleMinutes') maxIdleMinutes?: number) {
    return this.liveRoomsService.endStaleRooms(maxIdleMinutes);
  }

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('users')
  users(@Query('q') q?: string, @Query('status') status?: string, @Query('role') role?: string) {
    return this.admin.users(q, status, role);
  }

  @Get('search')
  search(@Query('q') q?: string) {
    return this.admin.search(q);
  }

  @Get('creators')
  creators(@Query('approvalStatus') approvalStatus?: string) {
    return this.admin.creators(approvalStatus);
  }

  @Get('live-rooms')
  liveRooms(@Query('status') status?: string) {
    return this.admin.liveRooms(status);
  }

  @Get('live-rooms/:id')
  liveRoom(@Param('id') id: string) {
    return this.liveRoomsService.get(id);
  }

  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('live-rooms/:id/end')
  endRoom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.liveRoomsService.adminEnd(user.sub, id);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('creators/:userId/suspend')
  suspendCreator(@CurrentUser() user: any, @Param('userId') userId: string, @Body('reason') reason?: string) {
    return this.creatorsService.suspendCreator(user.sub, userId, reason || 'Suspended');
  }

  @Get('payments')
  payments() {
    return this.admin.payments();
  }

  @Get('ledger/transactions')
  ledgerTransactions() {
    return this.admin.ledgerTransactions();
  }

  @Get('audit-logs')
  auditLogs() {
    return this.admin.auditLogs();
  }

  @Get('leaderboard')
  leaderboard(@Query('type') type?: string, @Query('window') window?: string, @Query('limit') limit?: string) {
    return this.admin.leaderboard(type, window, limit ? Number(limit) : undefined);
  }
}
