import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SupportersController } from './supporters.controller';
import { SupportersService } from './supporters.service';

@Module({ imports: [JwtModule.register({})], controllers: [SupportersController], providers: [SupportersService] })
export class SupportersModule {}
