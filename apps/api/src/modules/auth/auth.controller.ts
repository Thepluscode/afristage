import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AuthService, SessionMeta } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

// Device-session metadata straight off the request; both fields best-effort.
const metaOf = (req: any): SessionMeta => ({ ip: req.ip, userAgent: req.headers?.['user-agent'] });

// Auth endpoints are brute-force targets: 10 attempts/min/IP, well under the global 100.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto, metaOf(req));
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.auth.login(dto, metaOf(req));
  }

  // Public self-service reset request: always 201 {ok:true} (non-enumerating),
  // delivery via the optional email provider. Inherits the 10/min throttle.
  @Post('password-reset/request')
  passwordResetRequest(@Body() dto: PasswordResetRequestDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  // The reset token is itself the credential, so no JwtAuthGuard here.
  // Inherits the controller's 10/min brute-force throttle.
  @Post('password-reset/confirm')
  passwordResetConfirm(@Body() dto: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.newPassword);
  }

  // The refresh token is itself the credential, so no JwtAuthGuard here.
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto, @Req() req: any) {
    return this.auth.refresh(dto.refreshToken, metaOf(req));
  }

  // Signed-in devices for the caller; `current` marks this request's session.
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  sessions(@CurrentUser() user: any) {
    return this.auth.listSessions(user.sub, user.sid);
  }

  // Sign out ONE device (e.g. a lost phone) without touching the others.
  @UseGuards(JwtAuthGuard)
  @Post('sessions/:id/revoke')
  revokeSession(@CurrentUser() user: any, @Param('id') id: string) {
    return this.auth.revokeSession(user.sub, id);
  }

  // Sign out THIS device only.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser() user: any) {
    return this.auth.logout(user.sub, user.sid);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }

  // Revoke every refresh token for the caller ("sign out everywhere").
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@CurrentUser() user: any) {
    return this.auth.logoutAll(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  mfaSetup(@CurrentUser() user: any) {
    return this.auth.setupMfa(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  mfaEnable(@CurrentUser() user: any, @Body('token') token: string) {
    return this.auth.enableMfa(user.sub, token);
  }
}
