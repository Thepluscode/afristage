import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FraudController } from './fraud.controller';
import { FraudService } from './fraud.service';

@Module({ imports: [JwtModule.register({})], controllers: [FraudController], providers: [FraudService], exports: [FraudService] })
export class FraudModule {}
