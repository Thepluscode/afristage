import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

// A creator's payout destination. provider is the rail; destinationReference is
// the account number / mobile-money number / IBAN, validated as a non-empty
// opaque string (rail-specific format checks live with the payout provider).
export class CreatePayoutMethodDto {
  @IsIn(['BANK', 'MOBILE_MONEY']) provider!: 'BANK' | 'MOBILE_MONEY';
  @IsString() @IsNotEmpty() @Length(2, 2) country!: string; // ISO-3166 alpha-2
  @IsString() @IsNotEmpty() @Length(3, 3) currency!: string; // ISO-4217
  @IsString() @IsNotEmpty() @Length(4, 64) destinationReference!: string;
  @IsString() @IsNotEmpty() @Length(1, 60) label!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
