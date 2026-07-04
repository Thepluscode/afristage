import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // Optional device label for the session list, e.g. "iPhone 13".
  @IsOptional() @IsString() @MaxLength(80)
  device?: string;

  @IsString()
  identifier!: string;

  @IsString()
  password!: string;

  // TOTP code or a recovery code — required when the account has MFA enabled.
  @IsOptional() @IsString()
  mfaToken?: string;
}
