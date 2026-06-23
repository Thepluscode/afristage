import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  // The client only chooses a package; the server owns the price and coin amount,
  // so a client can never buy more coins than it pays for.
  @IsString() @IsNotEmpty() packageId!: string;
  // Defaults to 'mock'. 'paystack' kicks off a real hosted-checkout init.
  @IsOptional() @IsIn(['mock', 'paystack']) provider?: 'mock' | 'paystack';
}
