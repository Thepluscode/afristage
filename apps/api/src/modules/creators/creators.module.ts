import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CreatorsController } from './creators.controller';
import { CreatorsService } from './creators.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({ imports: [JwtModule.register({}), WalletModule], controllers: [CreatorsController], providers: [CreatorsService], exports: [CreatorsService] })
export class CreatorsModule {}
