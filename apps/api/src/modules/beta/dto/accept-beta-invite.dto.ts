import { IsString } from 'class-validator';

export class AcceptBetaInviteDto {
  @IsString() code!: string;
}
