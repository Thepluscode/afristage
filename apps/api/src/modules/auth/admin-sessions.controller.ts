import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AuthService } from './auth.service';

// Security ops over device sessions: view any account's active devices,
// force one out, or force them all out. Separate from AuthController so these
// admin reads don't inherit the login endpoints' brute-force throttle.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/users/:id/sessions')
export class AdminSessionsController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@Param('id') id: string) {
    return this.auth.adminListSessions(id);
  }

  @Post(':sessionId/revoke')
  revoke(@CurrentUser() user: any, @Param('id') id: string, @Param('sessionId') sessionId: string) {
    return this.auth.adminRevokeSession(user.sub, id, sessionId);
  }

  @Post('revoke-all')
  revokeAll(@CurrentUser() user: any, @Param('id') id: string) {
    return this.auth.adminRevokeAllSessions(user.sub, id);
  }
}
