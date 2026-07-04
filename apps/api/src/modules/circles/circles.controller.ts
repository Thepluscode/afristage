import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FraudService } from '../fraud/fraud.service';
import { CreateCircleDto } from './dto/create-circle.dto';
import { CirclesService } from './circles.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class CirclesController {
  constructor(private readonly circles: CirclesService, private readonly fraud: FraudService) {}

  @Post('circles')
  create(@CurrentUser() user: any, @Body() dto: CreateCircleDto) {
    return this.circles.create(user.sub, dto);
  }

  @Get('circles')
  list(@Query('limit') limit?: string) {
    return this.circles.list(limit ? Number(limit) : undefined);
  }

  @Get('circles/me')
  mine(@CurrentUser() user: any) {
    return this.circles.mine(user.sub);
  }

  @Get('circles/leaderboard')
  leaderboard(@Query('window') window?: string, @Query('limit') limit?: string) {
    return this.circles.leaderboard(window, limit ? Number(limit) : undefined);
  }

  @Get('circles/:id')
  detail(@Param('id') id: string) {
    return this.circles.detail(id);
  }

  @Post('circles/:id/join')
  join(@CurrentUser() user: any, @Param('id') id: string) {
    return this.circles.join(user.sub, id);
  }

  @Post('circles/leave')
  leave(@CurrentUser() user: any) {
    return this.circles.leave(user.sub);
  }

  // R4 §7 guardrail, wired concretely: one call runs the group fraud scorer
  // over a circle's membership (wash-trading / farm-cohort detection).
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/circles/:id/assess')
  async assess(@Param('id') id: string) {
    const memberIds = await this.circles.memberIds(id);
    return this.fraud.assessGroup(memberIds);
  }
}
