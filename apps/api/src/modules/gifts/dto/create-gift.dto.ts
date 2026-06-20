import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateGiftDto {
  @IsString() name!: string;
  @IsInt() @Min(1) coinPrice!: number;
  @IsOptional() @IsString() animationUrl?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
