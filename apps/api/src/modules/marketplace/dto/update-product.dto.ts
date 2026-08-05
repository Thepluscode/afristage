import { ProductStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000) priceCoins?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) stock?: number;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
}
