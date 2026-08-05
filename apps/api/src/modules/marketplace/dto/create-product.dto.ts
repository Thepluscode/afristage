import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsUrl() imageUrl?: string;
  // Bounded like a gift's coinPrice: priceCoins * quantity must stay inside the
  // Int total column, and no single order should move an unbounded amount.
  @IsInt() @Min(1) @Max(10_000_000) priceCoins!: number;
  // Omit for unlimited stock (digital or made-to-order).
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) stock?: number;
  // Set => link-out product: buying opens this URL instead of creating an order.
  @IsOptional() @IsUrl() externalUrl?: string;
}
