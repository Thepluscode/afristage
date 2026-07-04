import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('events')
  listCurrent() {
    return this.events.listCurrent();
  }

  @Get('events/:id/leaderboard')
  leaderboard(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.events.leaderboard(id, limit ? Number(limit) : undefined);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/events')
  listAll() {
    return this.events.listAll();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/events')
  create(@Body() dto: CreateEventDto) {
    return this.events.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('admin/events/:id')
  update(@Param('id') id: string, @Body() dto: UpdateEventDto) {
    return this.events.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/events/:id/settle')
  settle(@Param('id') id: string) {
    return this.events.settle(id);
  }
}
