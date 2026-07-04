import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletModule } from '../wallet/wallet.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({ imports: [JwtModule.register({}), WalletModule], controllers: [EventsController], providers: [EventsService] })
export class EventsModule {}
