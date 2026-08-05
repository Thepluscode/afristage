import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProductStatus, RoomStatus, Shop, ShopStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateShopDto } from './dto/update-shop.dto';

// Catalog side of the marketplace: shops, products, and the live-room pin that
// makes a product visible mid-stream. Money lives in OrdersService — a service
// that can only read and shape the catalog cannot accidentally move funds.

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- shops ----------

  // A shop opens PENDING: nothing is sellable until an admin approves it, so a
  // fresh account cannot list goods to a live audience before anyone looked.
  // externalUrl (the referral-shop marker, e.g. Bronzea) is admin-only — a
  // self-serve seller cannot turn their own shop into a link-out storefront.
  // `userId` is the OWNER, which is the caller on the self-serve path and the
  // named account on the admin path.
  async createShop(userId: string, dto: CreateShopDto, actorIsAdmin: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== UserStatus.ACTIVE) throw new ForbiddenException('Account is not active');

    const existing = await this.prisma.shop.findUnique({ where: { ownerUserId: userId } });
    if (existing) throw new BadRequestException('This account already has a shop');

    return this.prisma.shop.create({
      data: {
        ownerUserId: userId,
        name: dto.name,
        slug: await this.uniqueSlug(dto.name),
        description: dto.description ?? null,
        logoUrl: dto.logoUrl ?? null,
        externalUrl: actorIsAdmin ? dto.externalUrl ?? null : null
      }
    });
  }

  // slugify() can collide (two "Bronzea Beauty" shops) and can empty out
  // entirely for a name with no ASCII letters, so both cases fall back to a
  // random suffix rather than failing the create with a unique violation.
  private async uniqueSlug(name: string) {
    const base = slugify(name) || 'shop';
    const taken = await this.prisma.shop.findUnique({ where: { slug: base } });
    return taken ? `${base}-${randomUUID().slice(0, 6)}` : base;
  }

  myShop(userId: string) {
    return this.prisma.shop.findUnique({ where: { ownerUserId: userId } });
  }

  // Public: only an approved shop is visible. A suspended or pending shop is a
  // 404 rather than a 403 — a stranger has no business learning it exists.
  async publicShop(slug: string) {
    const shop = await this.prisma.shop.findUnique({ where: { slug } });
    if (!shop || shop.status !== ShopStatus.APPROVED) throw new NotFoundException('Shop not found');
    const products = await this.prisma.product.findMany({
      where: { shopId: shop.id, status: ProductStatus.ACTIVE },
      orderBy: { createdAt: 'desc' }
    });
    return { shop, products };
  }

  async updateShop(userId: string, dto: UpdateShopDto) {
    const shop = await this.ownedShop(userId);
    return this.prisma.shop.update({
      where: { id: shop.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {})
      }
    });
  }

  listShops(status?: ShopStatus) {
    return this.prisma.shop.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { products: true, orders: true } } }
    });
  }

  // What a reviewer needs before approving: who owns it, what it intends to
  // sell, and — for a referral shop — where it sends people.
  async adminShop(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { owner: { select: { id: true, email: true, profile: { select: { displayName: true, username: true } } } } }
    });
    if (!shop) throw new NotFoundException('Shop not found');

    const products = await this.prisma.product.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return { shop, products };
  }

  // Admin approve / suspend. Audited, because it is the gate that decides who
  // may take money from viewers.
  async setShopStatus(actorId: string, shopId: string, status: ShopStatus) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    const updated = await this.prisma.shop.update({ where: { id: shopId }, data: { status } });
    await this.prisma.adminAuditLog.create({
      data: { actorId, action: 'shop.status_changed', target: shopId, metadata: { from: shop.status, to: status } }
    });
    return updated;
  }

  // ---------- products ----------

  async createProduct(userId: string, dto: CreateProductDto) {
    const shop = await this.ownedShop(userId);
    // A referral shop links out; an in-app shop sells stock. Mixing the two in
    // one shop would make "is this order real?" a per-product question at every
    // call site, so the shop decides once.
    if (shop.externalUrl && !dto.externalUrl) {
      throw new BadRequestException('Products in a referral shop must have an externalUrl');
    }
    if (!shop.externalUrl && dto.externalUrl) {
      throw new BadRequestException('Only a referral shop can list link-out products');
    }

    return this.prisma.product.create({
      data: {
        shopId: shop.id,
        title: dto.title,
        description: dto.description ?? null,
        imageUrl: dto.imageUrl ?? null,
        priceCoins: dto.priceCoins,
        stock: dto.stock ?? null,
        externalUrl: dto.externalUrl ?? null
      }
    });
  }

  async updateProduct(userId: string, productId: string, dto: UpdateProductDto) {
    const shop = await this.ownedShop(userId);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.shopId !== shop.id) throw new NotFoundException('Product not found');

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.priceCoins !== undefined ? { priceCoins: dto.priceCoins } : {}),
        ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {})
      }
    });
  }

  async myProducts(userId: string) {
    const shop = await this.ownedShop(userId);
    return this.prisma.product.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' } });
  }

  // ---------- the live-room surface ----------

  // Only the host pins to their own room, and only their own live products. The
  // room must be LIVE: a pin on a scheduled or ended room is a card nobody can
  // see attached to a stream nobody is watching.
  async pinProduct(userId: string, roomId: string, productId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== userId) throw new ForbiddenException('Only the host can pin products');
    if (room.status !== RoomStatus.LIVE) throw new BadRequestException('Room is not live');

    const shop = await this.ownedShop(userId);
    if (shop.status !== ShopStatus.APPROVED) throw new ForbiddenException('Shop is not approved');

    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || product.shopId !== shop.id) throw new NotFoundException('Product not found');
    if (product.status !== ProductStatus.ACTIVE) throw new BadRequestException('Product is not active');

    const open = await this.prisma.roomProductPin.findFirst({ where: { roomId, productId, unpinnedAt: null } });
    if (open) return open; // idempotent: double-tapping pin is not an error

    return this.prisma.roomProductPin.create({ data: { roomId, productId } });
  }

  async unpinProduct(userId: string, roomId: string, productId: string) {
    const room = await this.prisma.liveRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.hostUserId !== userId) throw new ForbiddenException('Only the host can unpin products');

    const pin = await this.prisma.roomProductPin.findFirst({ where: { roomId, productId, unpinnedAt: null } });
    if (!pin) throw new NotFoundException('Product is not pinned to this room');

    return this.prisma.roomProductPin.update({ where: { id: pin.id }, data: { unpinnedAt: new Date() } });
  }

  // Public: what a viewer sees in the room right now. Archived products and
  // unapproved shops are filtered here, not in the client, so a stale pin can
  // never surface something that has since been pulled.
  async roomPins(roomId: string) {
    const pins = await this.prisma.roomProductPin.findMany({
      where: { roomId, unpinnedAt: null },
      orderBy: { pinnedAt: 'desc' },
      include: { product: { include: { shop: true } } }
    });
    return pins
      .filter((p) => p.product.status === ProductStatus.ACTIVE && p.product.shop.status === ShopStatus.APPROVED)
      .map((p) => ({
        pinId: p.id,
        pinnedAt: p.pinnedAt,
        product: {
          id: p.product.id,
          title: p.product.title,
          imageUrl: p.product.imageUrl,
          priceCoins: p.product.priceCoins,
          stock: p.product.stock,
          externalUrl: p.product.externalUrl
        },
        shop: { id: p.product.shop.id, name: p.product.shop.name, slug: p.product.shop.slug }
      }));
  }

  // A tap on a link-out product. Returns the destination so the client never has
  // to guess it, and counts the tap so a referral shop can show it earned the
  // placement. Non-link-out products have nowhere to go, so this is a 400.
  async recordClick(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: { shop: true } });
    if (!product || product.status !== ProductStatus.ACTIVE) throw new NotFoundException('Product not found');
    if (product.shop.status !== ShopStatus.APPROVED) throw new NotFoundException('Product not found');
    if (!product.externalUrl) throw new BadRequestException('This product is bought in-app, not linked out');

    await this.prisma.product.update({ where: { id: productId }, data: { clickCount: { increment: 1 } } });
    return { url: product.externalUrl };
  }

  // ---------- shared ----------

  private async ownedShop(userId: string): Promise<Shop> {
    const shop = await this.prisma.shop.findUnique({ where: { ownerUserId: userId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    if (shop.status === ShopStatus.SUSPENDED) throw new ForbiddenException('Shop is suspended');
    return shop;
  }
}
