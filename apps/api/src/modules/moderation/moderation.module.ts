import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LiveRoomsModule } from '../live-rooms/live-rooms.module';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({ imports: [JwtModule.register({}), LiveRoomsModule], controllers: [ModerationController], providers: [ModerationService] })
export class ModerationModule {}
