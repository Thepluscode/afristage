import { CreatorCategory } from '@prisma/client';
import { IsEnum, IsString, Matches, MaxLength } from 'class-validator';

export class ApplyCreatorDto {
  @IsString() @MaxLength(50) @Matches(/\S/, { message: 'stageName must not be blank' }) stageName!: string;
  @IsEnum(CreatorCategory) category!: CreatorCategory;
  @IsString() @MaxLength(80) country!: string;
  @IsString() @MaxLength(80) language!: string;
}
