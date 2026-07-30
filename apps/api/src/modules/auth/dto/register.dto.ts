import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  // Optional device label for the session list, e.g. "iPhone 13".
  @IsOptional() @IsString() @MaxLength(80)
  device?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  username!: string;

  @IsString()
  displayName!: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  language?: string;

  // IANA zone from the client (Intl.DateTimeFormat().resolvedOptions().timeZone).
  // Optional, because a client that cannot supply one must still be able to
  // register — a missing zone is a degraded schedule, not a failed sign-up.
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsBoolean()
  ageConfirmed!: boolean;
}
