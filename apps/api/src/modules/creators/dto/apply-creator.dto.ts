import { CreatorCategory } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class ApplyCreatorDto {
  @IsString() stageName!: string;
  @IsEnum(CreatorCategory) category!: CreatorCategory;
  @IsString() country!: string;
  @IsString() language!: string;
}
