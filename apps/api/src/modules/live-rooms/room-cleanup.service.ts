import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LiveRoomsService } from './live-rooms.service';

@Injectable()
export class RoomCleanupService {
  private readonly logger = new Logger(RoomCleanupService.name);

  constructor(private readonly rooms: LiveRoomsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep() {
    // A thrown sweep is swallowed by the scheduler and silently reschedules,
    // leaving crashed hosts' rooms stuck LIVE forever. Log so a failing sweep is
    // visible instead of silently leaking zombie rooms.
    try {
      await this.rooms.endStaleRooms();
    } catch (err) {
      this.logger.error(`Room cleanup sweep failed: ${(err as Error)?.message}`, (err as Error)?.stack);
    }
  }
}
