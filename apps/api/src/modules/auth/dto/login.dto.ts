import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  identifier!: string;

  @IsString()
  password!: string;

  // TOTP code or a recovery code — required when the account has MFA enabled.
  @IsOptional() @IsString()
  mfaToken?: string;
}
