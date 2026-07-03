import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';
import { FraudModule } from '../fraud/fraud.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [JwtModule.register({}), WalletModule, FraudModule],
  controllers: [MissionsController],
  providers: [MissionsService]
})
export class MissionsModule {}
