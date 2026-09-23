import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AddMessageDto {
  @IsString() @MaxLength(5000) @Matches(/\S/, { message: 'message must not be blank' }) message!: string;
  // Only honoured for admins (internal notes); ignored for end-user messages.
  @IsOptional() @IsBoolean() internal?: boolean;
}
