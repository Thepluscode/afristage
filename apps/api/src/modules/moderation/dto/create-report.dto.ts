import { ReportPriority, ReportReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReportDto {
  @IsOptional() @IsString() targetUserId?: string;
  @IsOptional() @IsString() roomId?: string;
  @IsEnum(ReportReason) reason!: ReportReason;
  @IsOptional() @IsString() @MaxLength(2000) details?: string;
  @IsOptional() @IsEnum(ReportPriority) priority?: ReportPriority;
}
