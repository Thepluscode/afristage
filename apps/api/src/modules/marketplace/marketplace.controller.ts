import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ShopStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AdminCreateShopDto } from './dto/admin-create-shop.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { PinProductDto } from './dto/pin-product.dto';
import { SetShopStatusDto } from './dto/set-shop-status.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { MarketplaceService } from './marketplace.service';

@Controller()
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  // ---------- public ----------

  // NOTE: the `shops/:slug` route is declared LAST, after every literal `shops/…`
  // path. Nest matches in declaration order, so putting it here would swallow
  // `GET /shops/me` — the seller's own shop would resolve as a lookup for a shop
  // whose slug is "me", and every seller would be told they have no shop.

  // What is pinned in this room right now. Public so a guest browsing a stream
  // sees the same shelf a signed-in viewer does.
  @Get('live-rooms/:roomId/products')
  roomPins(@Param('roomId') roomId: string) {
    return this.marketplace.roomPins(roomId);
  }

  // A tap on a link-out product. Public: a guest tapping through to the seller's
  // own storefront is exactly the traffic a referral shop is there to get.
  @Post('products/:id/click')
  click(@Param('id') id: string) {
    return this.marketplace.recordClick(id);
  }

  // ---------- the seller's own shop ----------

  @UseGuards(JwtAuthGuard)
  @Post('shops')
  createShop(@CurrentUser() user: any, @Body() dto: CreateShopDto) {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    return this.marketplace.createShop(user.sub, dto, isAdmin);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shops/me')
  myShop(@CurrentUser() user: any) {
    return this.marketplace.myShop(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('shops/me')
  updateShop(@CurrentUser() user: any, @Body() dto: UpdateShopDto) {
    return this.marketplace.updateShop(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('shops/me/products')
  createProduct(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.marketplace.createProduct(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('shops/me/products')
  myProducts(@CurrentUser() user: any) {
    return this.marketplace.myProducts(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('shops/me/products/:id')
  updateProduct(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.marketplace.updateProduct(user.sub, id, dto);
  }

  // ---------- the live-room shelf ----------

  @UseGuards(JwtAuthGuard)
  @Post('live-rooms/:roomId/products')
  pin(@CurrentUser() user: any, @Param('roomId') roomId: string, @Body() dto: PinProductDto) {
    return this.marketplace.pinProduct(user.sub, roomId, dto.productId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('live-rooms/:roomId/products/:productId')
  unpin(@CurrentUser() user: any, @Param('roomId') roomId: string, @Param('productId') productId: string) {
    return this.marketplace.unpinProduct(user.sub, roomId, productId);
  }

  // ---------- admin ----------

  // Onboard a shop on someone else's behalf — the route an operator-run brand
  // such as Bronzea comes in through, and the only one that may set externalUrl.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Post('admin/shops')
  adminCreateShop(@Body() dto: AdminCreateShopDto) {
    return this.marketplace.createShop(dto.ownerUserId, dto, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/shops')
  listShops(@Query('status') status?: ShopStatus) {
    return this.marketplace.listShops(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Get('admin/shops/:id')
  adminShop(@Param('id') id: string) {
    return this.marketplace.adminShop(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @Patch('admin/shops/:id/status')
  setShopStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SetShopStatusDto) {
    return this.marketplace.setShopStatus(user.sub, id, dto.status);
  }

  // ---------- the wildcard, deliberately last ----------

  // Must stay below `shops/me` and `admin/shops`: a `:slug` param matches any
  // single segment, so declaring it earlier makes it shadow every literal route
  // that shares the prefix.
  @Get('shops/:slug')
  publicShop(@Param('slug') slug: string) {
    return this.marketplace.publicShop(slug);
  }
}
