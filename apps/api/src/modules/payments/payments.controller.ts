import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // Server-authoritative coin catalog the client renders and selects from.
  @Get('coin-packages')
  packages() {
    return this.payments.listPackages();
  }

  @Post('coin-purchase-intents')
  create(@CurrentUser() user: any, @Body() dto: CreatePaymentIntentDto) {
    return this.payments.createIntent(user.sub, dto);
  }

  @Post('mock/:intentId/complete')
  completeMock(@CurrentUser() user: any, @Param('intentId') intentId: string) {
    return this.payments.completeMock(user.sub, intentId);
  }

  // Provider-agnostic pull-verify: the intent knows which processor it used.
  @Post('coin-purchase-intents/:intentId/verify')
  verify(@CurrentUser() user: any, @Param('intentId') intentId: string) {
    return this.payments.verifyCheckout(user.sub, intentId);
  }

  @Get('me')
  mine(@CurrentUser() user: any) {
    return this.payments.mine(user.sub);
  }
}
