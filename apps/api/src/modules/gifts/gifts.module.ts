import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';
import { WalletModule } from '../wallet/wallet.module';
import { ChatModule } from '../chat/chat.module';
import { AgenciesModule } from '../agencies/agencies.module';
import { FraudModule } from '../fraud/fraud.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JwtModule.register({}), WalletModule, ChatModule, NotificationsModule, FraudModule, AgenciesModule],
  controllers: [GiftsController],
  providers: [GiftsService],
  exports: [GiftsService]
})
export class GiftsModule {}
