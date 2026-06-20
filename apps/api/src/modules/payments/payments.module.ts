import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './providers/paystack.provider';

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, PaystackProvider]
})
export class PaymentsModule {}
