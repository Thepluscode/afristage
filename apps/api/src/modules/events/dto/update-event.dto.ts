import { IsInt, IsISO8601, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) prizePoolCoins?: number;
}
