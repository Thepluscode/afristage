import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsInt() @Min(100) amountMinor!: number;
  @IsString() currency!: string;
  @IsInt() @Min(1) coinAmount!: number;
  // Defaults to 'mock' so existing callers are unchanged. 'paystack' kicks off a
  // real hosted-checkout init.
  @IsOptional() @IsIn(['mock', 'paystack']) provider?: 'mock' | 'paystack';
}
