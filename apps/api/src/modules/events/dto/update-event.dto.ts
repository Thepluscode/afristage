import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateEventDto {
  @IsOptional() @IsString() @MinLength(3) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
}
