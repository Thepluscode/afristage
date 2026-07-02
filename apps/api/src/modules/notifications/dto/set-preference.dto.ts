import { IsBoolean, IsString, MinLength } from 'class-validator';

export class SetPreferenceDto {
  @IsString() @MinLength(3) type!: string;
  @IsBoolean() enabled!: boolean;
}
