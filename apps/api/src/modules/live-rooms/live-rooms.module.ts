import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { LiveRoomsController } from './live-rooms.controller';
import { LiveRoomsService } from './live-rooms.service';
import { LiveKitService } from './livekit.service';
import { RoomCleanupService } from './room-cleanup.service';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JwtModule.register({}), ChatModule, NotificationsModule],
  controllers: [LiveRoomsController],
  providers: [LiveRoomsService, LiveKitService, RoomCleanupService],
  exports: [LiveRoomsService]
})
export class LiveRoomsModule {}
