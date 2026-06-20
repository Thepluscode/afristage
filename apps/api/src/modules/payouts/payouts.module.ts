import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Module({ imports: [JwtModule.register({}), WalletModule], controllers: [PayoutsController], providers: [PayoutsService] })
export class PayoutsModule {}
