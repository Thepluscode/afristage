import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AssessGroupDto } from './dto/assess-group.dto';
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

  // Group-aggregate assessment (wash-trading rings, farm cohorts). POST because
  // the member set is a body payload, not addressable state.
  @Post('groups')
  assessGroup(@Body() dto: AssessGroupDto) {
    return this.fraud.assessGroup(dto.userIds);
  }
}
