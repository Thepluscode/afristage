import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateShopDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUrl() logoUrl?: string;
  // Only an admin may set this — see MarketplaceService.createShop. A creator
  // sending it on their own shop is ignored rather than rejected, so a stale
  // client can't be turned into a referral shop.
  @IsOptional() @IsUrl() externalUrl?: string;
}
