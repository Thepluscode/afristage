import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({ imports: [JwtModule.register({})], controllers: [ModerationController], providers: [ModerationService] })
export class ModerationModule {}
