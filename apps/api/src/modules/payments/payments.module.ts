import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentSyntheticService } from './payment-synthetic.service';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';
import { StripeProvider } from './providers/stripe.provider';
import { RevenueMonitorService } from './revenue-monitor.service';

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, PaystackProvider, StripeProvider, RevenueMonitorService, PaymentSyntheticService]
})
export class PaymentsModule {}
