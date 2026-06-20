import { IsInt, IsString, Min } from 'class-validator';

export class SendGiftDto {
  @IsString() giftId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsString() idempotencyKey!: string;
}
