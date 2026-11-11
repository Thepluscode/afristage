import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ReplaceTiersDto } from './dto/replace-tiers.dto';
import { TargetBonusService } from './target-bonus.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TargetBonusController {
  constructor(private readonly bonus: TargetBonusService) {}

  @Get('target-bonus/me')
  me(@CurrentUser() user: any) {
    return this.bonus.me(user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/target-bonus/tiers')
  tiers() {
    return this.bonus.listTiers();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  // POST, not PUT: the admin-web proxy forwards GET/POST/PATCH/DELETE only.
  @Post('admin/target-bonus/tiers')
  replaceTiers(@CurrentUser() user: any, @Body() dto: ReplaceTiersDto) {
    return this.bonus.replaceTiers(user.sub, dto.tiers);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/target-bonus/months/:month')
  month(@Param('month') month: string) {
    return this.bonus.month(month);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/target-bonus/months/:month/pay')
  pay(@CurrentUser() user: any, @Param('month') month: string) {
    return this.bonus.pay(user.sub, month);
  }
}
