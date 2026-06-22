import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutsService } from './payouts.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post('payouts/request')
  request(@CurrentUser() user: any, @Body() dto: RequestPayoutDto) {
    return this.payouts.request(user.sub, dto);
  }

  @Get('payouts/me')
  mine(@CurrentUser() user: any) {
    return this.payouts.mine(user.sub);
  }

  @Get('payouts/methods')
  methods(@CurrentUser() user: any) {
    return this.payouts.listMethods(user.sub);
  }

  @Post('payouts/methods')
  addMethod(@CurrentUser() user: any, @Body() dto: CreatePayoutMethodDto) {
    return this.payouts.createMethod(user.sub, dto);
  }

  @Delete('payouts/methods/:id')
  removeMethod(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payouts.deleteMethod(user.sub, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Get('admin/payouts')
  adminList(@Query('status') status?: string) {
    return this.payouts.adminList(status);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Post('admin/payouts/:id/hold')
  hold(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.payouts.hold(user.sub, id, reason);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Post('admin/payouts/:id/release')
  release(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payouts.release(user.sub, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Post('admin/payouts/:id/approve')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payouts.approve(user.sub, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Post('admin/payouts/:id/reject')
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.payouts.reject(user.sub, id, reason || 'Rejected');
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PAYOUT_REVIEWER)
  @Post('admin/payouts/:id/mark-paid')
  markPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.payouts.markPaid(user.sub, id);
  }
}
