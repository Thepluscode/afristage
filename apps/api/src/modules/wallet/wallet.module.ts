import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { LedgerService } from './ledger.service';
import { LedgerIntegrityService } from './ledger-integrity.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [WalletController],
  providers: [WalletService, LedgerService, LedgerIntegrityService],
  exports: [WalletService, LedgerService, LedgerIntegrityService]
})
export class WalletModule {}
