import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { SupportersService } from './supporters.service';

@UseGuards(JwtAuthGuard)
@Controller('creators')
export class SupportersController {
  constructor(private readonly supporters: SupportersService) {}

  // The creator's Supporter Circle (loyalty leaderboard with tiers).
  @Get(':creatorId/supporters')
  circle(@Param('creatorId') creatorId: string, @Query('limit') limit?: string) {
    return this.supporters.circle(creatorId, limit ? Number(limit) : undefined);
  }

  // The caller's own standing with this creator.
  @Get(':creatorId/supporters/me')
  myStanding(@CurrentUser() user: any, @Param('creatorId') creatorId: string) {
    return this.supporters.myStanding(creatorId, user.sub);
  }
}
