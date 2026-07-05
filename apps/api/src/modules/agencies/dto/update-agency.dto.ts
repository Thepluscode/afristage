import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateAgencyDto {
  @IsOptional() @IsInt() @Min(0) @Max(5000) commissionBps?: number;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
}
