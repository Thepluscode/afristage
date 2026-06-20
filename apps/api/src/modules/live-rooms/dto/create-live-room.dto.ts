import { CreatorCategory } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateLiveRoomDto {
  @IsString() title!: string;
  @IsEnum(CreatorCategory) category!: CreatorCategory;
  @IsString() country!: string;
  @IsString() language!: string;
}
