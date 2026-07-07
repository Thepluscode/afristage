import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminSessionsController } from './admin-sessions.controller';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [JwtModule.register({}), WalletModule],
  controllers: [AuthController, AdminSessionsController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
