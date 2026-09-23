import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { SupportTicketType } from '@prisma/client';

export class CreateSupportTicketDto {
  @IsEnum(SupportTicketType) type!: SupportTicketType;
  @IsString() @MaxLength(200) @Matches(/\S/, { message: 'subject must not be blank' }) subject!: string;
  @IsString() @MaxLength(5000) @Matches(/\S/, { message: 'description must not be blank' }) description!: string;
  @IsOptional() @IsString() relatedPaymentId?: string;
  @IsOptional() @IsString() relatedPayoutId?: string;
  @IsOptional() @IsString() relatedRoomId?: string;
}
