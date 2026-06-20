import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { WalletService } from './wallet.service';

@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('me')
  summary(@CurrentUser() user: any) {
    return this.wallet.summary(user.sub);
  }

  @Get('me/ledger')
  history(@CurrentUser() user: any) {
    return this.wallet.ledgerHistory(user.sub);
  }
}
