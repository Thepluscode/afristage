import { Global, Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { MoneyService } from './money.service';

// Global: every money-touching feature (gifts, missions, events, payouts,
// payments) posts through this one catalog — RFC #144.
@Global()
@Module({ imports: [WalletModule], providers: [MoneyService], exports: [MoneyService] })
export class MoneyModule {}
