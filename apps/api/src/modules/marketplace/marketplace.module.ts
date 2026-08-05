import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MoneyModule } from '../money/money.module';

@Module({
  imports: [JwtModule.register({}), MoneyModule],
  controllers: [MarketplaceController, OrdersController],
  providers: [MarketplaceService, OrdersService],
  exports: [MarketplaceService, OrdersService]
})
export class MarketplaceModule {}
