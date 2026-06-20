import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LiveRoomsService } from './live-rooms.service';

@Injectable()
export class RoomCleanupService {
  constructor(private readonly rooms: LiveRoomsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    await this.rooms.endStaleRooms();
  }
}
