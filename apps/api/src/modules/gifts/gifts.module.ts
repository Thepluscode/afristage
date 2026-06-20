import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';
import { WalletModule } from '../wallet/wallet.module';
import { ChatModule } from '../chat/chat.module';

@Module({ imports: [JwtModule.register({}), WalletModule, ChatModule], controllers: [GiftsController], providers: [GiftsService], exports: [GiftsService] })
export class GiftsModule {}
