import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCircleDto {
  @IsString() @MinLength(3) @MaxLength(40) name!: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
}
