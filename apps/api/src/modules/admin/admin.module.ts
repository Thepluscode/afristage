import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { WalletModule } from '../wallet/wallet.module';
import { LiveRoomsModule } from '../live-rooms/live-rooms.module';
import { CreatorsModule } from '../creators/creators.module';

@Module({ imports: [JwtModule.register({}), WalletModule, LiveRoomsModule, CreatorsModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
