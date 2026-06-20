import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class RequestPayoutDto {
  // Coins to withdraw — the authoritative unit. Fiat settlement is derived server-side.
  @IsInt() @Min(1) coinAmount!: number;
  // Required idempotency key so a retried request never creates a second hold transfer.
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() payoutMethodId?: string;
}
