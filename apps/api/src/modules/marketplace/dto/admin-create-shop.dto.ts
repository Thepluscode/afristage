import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

// An admin opening a shop ON BEHALF OF an owner — how an operator-run brand such
// as Bronzea is onboarded. Distinct from the self-serve CreateShopDto because
// only this path may name a different owner or set the referral marker.
export class AdminCreateShopDto {
  @IsString() ownerUserId!: string;
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsUrl() logoUrl?: string;
  @IsOptional() @IsUrl() externalUrl?: string;
}
