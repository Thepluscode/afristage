import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FundPromoDto } from './dto/fund-promo.dto';
import { MissionsService } from './missions.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MissionsController {
  constructor(private readonly missions: MissionsService) {}

  @Get('missions/me')
  board(@CurrentUser() user: any) {
    return this.missions.board(user.sub);
  }

  @Post('missions/:key/claim')
  claim(@CurrentUser() user: any, @Param('key') key: string) {
    return this.missions.claim(user.sub, key);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/missions/promo')
  promoStatus() {
    return this.missions.promoStatus();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/missions/fund')
  fund(@CurrentUser() user: any, @Body() dto: FundPromoDto) {
    return this.missions.fund(user.sub, dto.coins);
  }
}
