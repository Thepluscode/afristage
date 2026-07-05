import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { AgenciesController } from './agencies.controller';
import { AgenciesService } from './agencies.service';

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [AgenciesController],
  providers: [AgenciesService],
  exports: [AgenciesService]
})
export class AgenciesModule {}
