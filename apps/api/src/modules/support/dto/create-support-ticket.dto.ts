import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SupportTicketType } from '@prisma/client';

export class CreateSupportTicketDto {
  @IsEnum(SupportTicketType) type!: SupportTicketType;
  @IsString() subject!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() relatedPaymentId?: string;
  @IsOptional() @IsString() relatedPayoutId?: string;
  @IsOptional() @IsString() relatedRoomId?: string;
}
