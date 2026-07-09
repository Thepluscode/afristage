import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

// Public (no JWT): the processors call these directly. Auth is the per-provider
// HMAC signature over the raw body, verified in the service — not a token.
// Exempt from the app-wide per-IP rate limit: providers retry on their own
// schedule and must not compete with user traffic for the throttle bucket — a
// throttled webhook would drop a real payment to the pull-verify fallback.
@SkipThrottle()
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('paystack')
  @HttpCode(200)
  paystack(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    return this.payments.handleWebhook('paystack', req.rawBody, signature);
  }

  @Post('stripe')
  @HttpCode(200)
  stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    return this.payments.handleWebhook('stripe', req.rawBody, signature);
  }
}
