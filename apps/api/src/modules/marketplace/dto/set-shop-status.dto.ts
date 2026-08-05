import { ShopStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetShopStatusDto {
  @IsEnum(ShopStatus) status!: ShopStatus;
}
