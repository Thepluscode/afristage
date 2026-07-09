import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  // The client only chooses a package; the server owns the price and coin amount,
  // so a client can never buy more coins than it pays for.
  @IsString() @IsNotEmpty() packageId!: string;
  // Defaults to 'mock' (dev). 'card' kicks off a real hosted checkout, routed to
  // the processor the package's currency settles through (Paystack for African
  // corridors, Stripe for global cards).
  @IsOptional() @IsIn(['mock', 'card']) provider?: 'mock' | 'card';
}
