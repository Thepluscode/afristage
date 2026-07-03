import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsString() @MinLength(3) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
}
