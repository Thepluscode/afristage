import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BetaController } from './beta.controller';
import { BetaPublicController } from './beta-public.controller';
import { BetaService } from './beta.service';

@Module({ imports: [JwtModule.register({})], controllers: [BetaController, BetaPublicController], providers: [BetaService] })
export class BetaModule {}
