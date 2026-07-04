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

  @IsBoolean()
  ageConfirmed!: boolean;
}
