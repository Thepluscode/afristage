import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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
    @Query('viewerCountry') viewerCountry?: string
  ) {
    return this.rooms.list({ country, category, viewerLanguage, viewerCountry });
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
}
