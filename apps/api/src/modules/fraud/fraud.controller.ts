import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FraudService } from './fraud.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/fraud')
export class FraudController {
  constructor(private readonly fraud: FraudService) {}

  // Explainable fraud assessment for a creator, for the payout-review queue.
  @Get('creators/:userId')
  assessCreator(@Param('userId') userId: string) {
    return this.fraud.assessCreator(userId);
  }
}
