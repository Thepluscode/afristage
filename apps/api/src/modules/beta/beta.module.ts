import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BetaController } from './beta.controller';
import { BetaService } from './beta.service';

@Module({ imports: [JwtModule.register({})], controllers: [BetaController], providers: [BetaService] })
export class BetaModule {}
