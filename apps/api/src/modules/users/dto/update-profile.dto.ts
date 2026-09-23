import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BIO_MAX, DISPLAY_NAME, SHORT_FIELD_MAX, URL_MAX } from './profile-rules';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Matches(DISPLAY_NAME.pattern, { message: DISPLAY_NAME.message }) @MaxLength(DISPLAY_NAME.max, { message: DISPLAY_NAME.message }) displayName?: string;
  @IsOptional() @IsString() @MaxLength(URL_MAX) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(BIO_MAX) bio?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_FIELD_MAX) country?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_FIELD_MAX) city?: string;
  @IsOptional() @IsString() @MaxLength(SHORT_FIELD_MAX) language?: string;
}
