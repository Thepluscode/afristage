import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { BetaInviteType } from '@prisma/client';

export class CreateBetaInviteDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(BetaInviteType) type!: BetaInviteType;
}
