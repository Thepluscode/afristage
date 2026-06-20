import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestBetaInviteDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsString() @MaxLength(40) country?: string;
}
