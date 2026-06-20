import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Get(':id')
  get(@Param('id') id: string) {
    return this.creators.getPublic(id);
  }
}
