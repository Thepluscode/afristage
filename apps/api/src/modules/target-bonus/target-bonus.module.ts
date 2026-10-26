import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { TargetBonusController } from './target-bonus.controller';
import { TargetBonusService } from './target-bonus.service';

@Module({ imports: [JwtModule.register({}), WalletModule], controllers: [TargetBonusController], providers: [TargetBonusService] })
export class TargetBonusModule {}
