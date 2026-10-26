import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';

export class TierDto {
  @IsInt() @Min(1) @Max(100_000_000) minGiftCoins!: number;
  @IsInt() @Min(1) @Max(10_000_000) bonusCoins!: number;
}

export class ReplaceTiersDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TierDto)
  tiers!: TierDto[];
}
