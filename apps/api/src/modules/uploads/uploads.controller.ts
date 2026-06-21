import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UploadsService } from './uploads.service';

@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } }) // presign is cheap but shouldn't be spammed
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  // Returns a short-lived PUT URL the client uploads to directly, plus the public
  // URL to save (via PATCH /users/me, admin gift update, etc.).
  @Post('presign')
  presign(@CurrentUser() user: any, @Body() dto: PresignUploadDto) {
    return this.uploads.presign(user.sub, dto);
  }
}
