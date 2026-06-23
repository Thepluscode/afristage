import { CreatorCategory } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateLiveRoomDto {
  @IsString() title!: string;
  @IsEnum(CreatorCategory) category!: CreatorCategory;
  @IsString() country!: string;
  @IsString() language!: string;
  // Optional: announce a future start time so the room shows in the upcoming feed.
  @IsOptional() @IsISO8601() scheduledStartAt?: string;
}
