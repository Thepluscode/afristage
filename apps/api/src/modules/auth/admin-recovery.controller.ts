import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AuthService } from './auth.service';

// Account recovery ops (support Tier-2 resolutions): issue a one-time password
// reset token, or rotate a lost second factor. Both audited; both require the
// operator to have verified the user's identity out-of-band first. Separate
// controller so these don't inherit the login endpoints' brute-force throttle.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/users/:id')
export class AdminRecoveryController {
  constructor(private readonly auth: AuthService) {}

  @Post('password-reset-token')
  issuePasswordResetToken(@CurrentUser() user: any, @Param('id') id: string) {
    return this.auth.adminIssuePasswordResetToken(user.sub, id);
  }

  @Post('mfa-reset')
  resetMfa(@CurrentUser() user: any, @Param('id') id: string) {
    return this.auth.adminResetMfa(user.sub, id);
  }
}
