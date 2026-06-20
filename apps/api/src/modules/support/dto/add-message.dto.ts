import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AddMessageDto {
  @IsString() message!: string;
  // Only honoured for admins (internal notes); ignored for end-user messages.
  @IsOptional() @IsBoolean() internal?: boolean;
}
