import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { ApplyCreatorDto } from './dto/apply-creator.dto';
import { CreatorsService } from './creators.service';

@UseGuards(JwtAuthGuard)
@Controller('creators')
export class CreatorsController {
  constructor(private readonly creators: CreatorsService) {}

  @Post('apply')
  apply(@CurrentUser() user: any, @Body() dto: ApplyCreatorDto) {
    return this.creators.apply(user.sub, dto);
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.creators.getMe(user.sub);
  }

  @Get('me/dashboard')
  dashboard(@CurrentUser() user: any) {
    return this.creators.dashboard(user.sub);
  }

  // Per-room performance for the signed-in creator. Declared before :id so
  // "me" path segments aren't captured as a creator id.
  @Get('me/rooms')
  myRooms(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.creators.myRooms(user.sub, limit ? Number(limit) : 50);
  }

  @Get(':id')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.creators.getPublic(id, user.sub);
  }
}
