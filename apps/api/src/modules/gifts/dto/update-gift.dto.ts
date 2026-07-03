import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateGiftDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() eventId?: string;
  @IsOptional() @IsInt() @Min(1) coinPrice?: number;
  @IsOptional() @IsString() animationUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
