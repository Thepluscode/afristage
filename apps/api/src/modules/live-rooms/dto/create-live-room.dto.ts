import { CreatorCategory } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLiveRoomDto {
  @IsString() @MaxLength(100) @Matches(/\S/, { message: 'title must not be blank' }) title!: string;
  @IsEnum(CreatorCategory) category!: CreatorCategory;
  @IsString() @MaxLength(80) country!: string;
  @IsString() @MaxLength(80) language!: string;
  // Optional: announce a future start time so the room shows in the upcoming feed.
  @IsOptional() @IsISO8601() scheduledStartAt?: string;
}
