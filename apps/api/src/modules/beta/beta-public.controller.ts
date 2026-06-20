import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BetaService } from './beta.service';
import { RequestBetaInviteDto } from './dto/request-beta-invite.dto';

// Public, unauthenticated waitlist capture for the marketing landing page.
// Tighter rate limit than the global default since it takes no credential.
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('beta')
export class BetaPublicController {
  constructor(private readonly beta: BetaService) {}

  @Post('request')
  request(@Body() dto: RequestBetaInviteDto) {
    return this.beta.requestInvite(dto);
  }
}
