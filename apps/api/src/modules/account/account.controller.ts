import { Body, Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { AccountService } from './account.service';
import { DeleteAccountDto } from './dto/delete-account.dto';

@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // Self-service soft delete (password re-auth). Data retained 30 days, then purged.
  @Delete()
  delete(@CurrentUser() user: any, @Body() dto: DeleteAccountDto) {
    return this.account.selfDelete(user.sub, dto.password);
  }

  // GDPR Art. 15 — everything we hold on you.
  @Get('export')
  export(@CurrentUser() user: any) {
    return this.account.export(user.sub);
  }
}
