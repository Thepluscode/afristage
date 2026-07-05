import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AgenciesService } from './agencies.service';
import { CreateAgencyDto } from './dto/create-agency.dto';
import { UpdateAgencyDto } from './dto/update-agency.dto';

// Admin-only: onboarding/vetting, commission config, suspension (R4 §8).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/agencies')
export class AgenciesController {
  constructor(private readonly agencies: AgenciesService) {}

  @Post()
  create(@Body() dto: CreateAgencyDto) {
    return this.agencies.create(dto);
  }

  @Get()
  list() {
    return this.agencies.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.agencies.detail(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgencyDto) {
    return this.agencies.update(id, dto);
  }

  @Post(':id/creators')
  addCreator(@Param('id') id: string, @Body('creatorUserId') creatorUserId: string) {
    return this.agencies.addCreator(id, creatorUserId);
  }

  @Delete(':id/creators/:creatorUserId')
  removeCreator(@Param('id') id: string, @Param('creatorUserId') creatorUserId: string) {
    return this.agencies.removeCreator(id, creatorUserId);
  }
}
