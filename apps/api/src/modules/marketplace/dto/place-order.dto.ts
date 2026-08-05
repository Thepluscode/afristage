import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PlaceOrderDto {
  @IsString() productId!: string;
  // Bounded like a gift's quantity so unitPrice * quantity cannot overflow the
  // Int total column.
  @IsInt() @Min(1) @Max(1000) quantity!: number;
  // Attribution: the live room the buyer tapped the pinned card in.
  @IsOptional() @IsString() roomId?: string;
  // The buyer's own key. Two submits of one checkout charge once.
  @IsString() idempotencyKey!: string;
}
