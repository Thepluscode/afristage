import { IsInt, Min } from 'class-validator';

export class FundPromoDto {
  @IsInt() @Min(1) coins!: number;
}
