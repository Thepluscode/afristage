import { IsIn, IsString } from 'class-validator';

// Only image types are accepted today (avatars, gift animations). Widen the
// allowlist deliberately if/when video uploads are introduced.
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export class PresignUploadDto {
  @IsString() @IsIn(Object.keys(ALLOWED_CONTENT_TYPES)) contentType!: string;
  @IsString() @IsIn(['avatar', 'gift_animation']) kind!: 'avatar' | 'gift_animation';
}
