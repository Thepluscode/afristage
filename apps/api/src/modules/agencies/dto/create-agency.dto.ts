import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateAgencyDto {
  @IsString() @MinLength(3) @MaxLength(80) name!: string;
  @IsString() ownerUserId!: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  // Share of the CREATOR's cut. Capped at 50% — no agency may take the majority.
  @IsOptional() @IsInt() @Min(0) @Max(5000) commissionBps?: number;
}
