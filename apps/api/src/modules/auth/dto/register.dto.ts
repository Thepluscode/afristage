import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DISPLAY_NAME, USERNAME } from '../../users/dto/profile-rules';

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
  @Matches(USERNAME.pattern, { message: USERNAME.message })
  username!: string;

  @IsString()
  @Matches(DISPLAY_NAME.pattern, { message: DISPLAY_NAME.message })
  @MaxLength(DISPLAY_NAME.max, { message: DISPLAY_NAME.message })
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
