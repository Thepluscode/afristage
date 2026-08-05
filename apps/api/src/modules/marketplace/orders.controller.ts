import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { PlaceOrderDto } from './dto/place-order.dto';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders')
  place(@CurrentUser() user: any, @Body() dto: PlaceOrderDto) {
    return this.orders.place(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/me')
  myOrders(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.orders.myOrders(user.sub, limit ? Number(limit) : 50);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shops/me/orders')
  shopOrders(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.orders.shopOrders(user.sub, limit ? Number(limit) : 50);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('shops/me/orders/:id/fulfil')
  fulfil(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.fulfil(user.sub, id);
  }
}
