import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaymentsService } from './payments.service';

// Public (no JWT): Paystack calls this directly. Auth is the HMAC signature, not a token.
@Controller('payments/webhooks')
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('paystack')
  @HttpCode(200)
  paystack(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    return this.payments.handlePaystackWebhook(req.rawBody, signature);
  }
}
