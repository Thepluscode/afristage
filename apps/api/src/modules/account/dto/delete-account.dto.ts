import { IsString } from 'class-validator';

export class DeleteAccountDto {
  // Re-authenticate the current password before an irreversible-ish self-delete
  // (defends a hijacked session).
  @IsString()
  password!: string;
}
