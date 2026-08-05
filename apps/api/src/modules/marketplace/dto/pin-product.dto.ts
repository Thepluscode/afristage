import { IsString } from 'class-validator';

export class PinProductDto {
  @IsString() productId!: string;
}
