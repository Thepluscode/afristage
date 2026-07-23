import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CreateLiveRoomDto } from './dto/create-live-room.dto';
import { LiveRoomsService } from './live-rooms.service';

@Controller('live-rooms')
export class LiveRoomsController {
  constructor(private readonly rooms: LiveRoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateLiveRoomDto) {
    return this.rooms.create(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  start(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rooms.start(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/end')
  end(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rooms.end(user.sub, id);
  }

  @Get()
  list(
    @Query('country') country?: string,
    @Query('category') category?: any,
    @Query('viewerLanguage') viewerLanguage?: string,
    @Query('viewerCountry') viewerCountry?: string,
    @Query('q') q?: string
  ) {
    return this.rooms.list({ country, category, viewerLanguage, viewerCountry, q });
  }

  // Public upcoming feed. Declared before :id so "upcoming" isn't captured as an id.
  @Get('upcoming')
  upcoming(@Query('limit') limit?: string) {
    return this.rooms.upcoming(limit ? Number(limit) : 50);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.rooms.get(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join-token')
  join(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rooms.joinToken(user.sub, id);
  }

  // PUBLIC (no guard) so a shared link plays for a signed-out visitor. Throttled —
  // it's an unauthenticated token mint; view-only tokens are cheap but must not be
  // farmed.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/guest-token')
  guestToken(@Param('id') id: string) {
    return this.rooms.guestToken(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/remind')
  setReminder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rooms.setReminder(user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/remind')
  cancelReminder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rooms.cancelReminder(user.sub, id);
  }
}
