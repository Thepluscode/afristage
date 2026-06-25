import { IsInt, IsString, Max, Min } from 'class-validator';

export class SendGiftDto {
  @IsString() giftId!: string;
  // Bounded so coinPrice * quantity can't overflow the Int total column or move
  // an arbitrarily large amount in a single request.
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @IsString() idempotencyKey!: string;
}
