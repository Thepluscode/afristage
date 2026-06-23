import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { SendGiftDto } from './dto/send-gift.dto';
import { CreateGiftDto } from './dto/create-gift.dto';
import { UpdateGiftDto } from './dto/update-gift.dto';
import { GiftsService } from './gifts.service';

@Controller()
export class GiftsController {
  constructor(private readonly gifts: GiftsService) {}

  @Get('gifts')
  list() {
    return this.gifts.list();
  }

  // A viewer's own gift-sending history.
  @UseGuards(JwtAuthGuard)
  @Get('gifts/me')
  myGifts(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.gifts.myGifts(user.sub, limit ? Number(limit) : 50);
  }

  // Public: room "top supporters" leaderboard, ranked by total coins gifted.
  @Get('live-rooms/:roomId/top-gifters')
  topGifters(@Param('roomId') roomId: string, @Query('limit') limit?: string) {
    return this.gifts.topGifters(roomId, limit ? Number(limit) : 10);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/gifts')
  create(@Body() dto: CreateGiftDto) {
    return this.gifts.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('admin/gifts/:id')
  update(@Param('id') id: string, @Body() dto: UpdateGiftDto) {
    return this.gifts.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('live-rooms/:roomId/gifts')
  send(@CurrentUser() user: any, @Param('roomId') roomId: string, @Body() dto: SendGiftDto) {
    return this.gifts.send(user.sub, roomId, dto);
  }
}
