import { Body, Controller, Get, Patch, Post, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.users.me(user.sub);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.sub, dto);
  }

  @Post(':id/follow')
  follow(@CurrentUser() user: any, @Param('id') id: string) {
    return this.users.follow(user.sub, id);
  }

  @Post(':id/block')
  block(@CurrentUser() user: any, @Param('id') id: string) {
    return this.users.block(user.sub, id);
  }
}
