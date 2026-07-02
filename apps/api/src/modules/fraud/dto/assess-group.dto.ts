import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class AssessGroupDto {
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(200) @IsString({ each: true })
  userIds!: string[];
}
