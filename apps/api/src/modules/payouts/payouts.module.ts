import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({ imports: [JwtModule.register({}), WalletModule, NotificationsModule], controllers: [PayoutsController], providers: [PayoutsService] })
export class PayoutsModule {}
