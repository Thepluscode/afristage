import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { MoneyService } from '../money/money.service';
import { OrdersService } from './orders.service';

const dto = { productId: 'p1', quantity: 1, idempotencyKey: 'k1' };

function build(overrides: any = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    product: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    liveRoom: { findUnique: jest.fn() },
    shop: { findUnique: jest.fn() },
    order: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    ledgerTransaction: { findUnique: jest.fn().mockResolvedValue(null) }
  };
  const wallet: any = {
    balance: jest.fn().mockResolvedValue('1000'),
    account: jest.fn().mockResolvedValue({ id: 'acc' }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'sys' })
  };
  const ledger: any = { postTransaction: jest.fn().mockResolvedValue({ id: 'tx1' }) };

  const shop = overrides.shop ?? { id: 's1', ownerUserId: 'seller', status: 'APPROVED', externalUrl: null };
  prisma.user.findUnique.mockResolvedValue(overrides.buyer ?? { id: 'b1', status: 'ACTIVE' });
  prisma.product.findUnique.mockResolvedValue(
    overrides.product ?? { id: 'p1', status: 'ACTIVE', priceCoins: 100, stock: 5, externalUrl: null, shopId: 's1', shop }
  );
  prisma.liveRoom.findUnique.mockResolvedValue(overrides.room ?? { id: 'r1', status: 'LIVE', hostUserId: 'seller' });
  prisma.order.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'o1', ...data }));

  const service = new OrdersService(prisma, new MoneyService(prisma, ledger, wallet, new MetricsService()));
  return { service, prisma, wallet, ledger };
}

describe('OrdersService.place — authorisation and validation', () => {
  it('rejects a suspended buyer', async () => {
    const { service } = build({ buyer: { id: 'b1', status: 'SUSPENDED' } });
    await expect(service.place('b1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an archived product', async () => {
    const { service } = build({ product: { id: 'p1', status: 'ARCHIVED', priceCoins: 100, stock: 5, shop: {} } });
    await expect(service.place('b1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  // A pending or suspended shop is a 404, not a 403: a stranger has no business
  // learning that a shop under review exists.
  it.each(['PENDING', 'SUSPENDED'])('hides a %s shop behind a 404', async (status) => {
    const shop = { id: 's1', ownerUserId: 'seller', status, externalUrl: null };
    const { service } = build({ shop, product: { id: 'p1', status: 'ACTIVE', priceCoins: 100, stock: 5, externalUrl: null, shopId: 's1', shop } });
    await expect(service.place('b1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a seller buying from their own shop', async () => {
    const { service } = build();
    await expect(service.place('seller', dto)).rejects.toThrow('your own shop');
  });

  it('rejects ordering a link-out (referral) product — there is nothing to charge for', async () => {
    const shop = { id: 's1', ownerUserId: 'seller', status: 'APPROVED', externalUrl: 'https://bronzea.example' };
    const product = { id: 'p1', status: 'ACTIVE', priceCoins: 100, stock: null, externalUrl: 'https://bronzea.example/p1', shopId: 's1', shop };
    const { service } = build({ shop, product });
    await expect(service.place('b1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attribution to a room that is not live', async () => {
    const { service } = build({ room: { id: 'r1', status: 'ENDED', hostUserId: 'seller' } });
    await expect(service.place('b1', { ...dto, roomId: 'r1' })).rejects.toThrow('Room is not live');
  });

  it('rejects attribution to an unknown room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.place('b1', { ...dto, roomId: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrdersService.place — the money move', () => {
  it('splits the sale between the seller and the platform, and records both legs', async () => {
    const { service, ledger } = build();
    const order = await service.place('b1', { ...dto, quantity: 2 }); // 2 x 100 = 200

    // Default SELLER_SHARE_BPS = 9000 -> seller 180, platform 20.
    expect(order.totalCoins).toBe(200);
    expect(order.sellerNetCoins).toBe(180);
    expect(order.platformFeeCoins).toBe(20);

    const post = ledger.postTransaction.mock.calls[0][0];
    expect(post.type).toBe('PURCHASE');
    // The debit must equal the sum of the credits, or the ledger does not balance.
    const debit = post.entries.find((e: any) => e.direction === 'DEBIT');
    const credits = post.entries.filter((e: any) => e.direction === 'CREDIT');
    expect(debit.amountMinor).toBe(200);
    expect(credits.reduce((s: number, e: any) => s + e.amountMinor, 0)).toBe(200);
    // The buyer's account is the guarded one: a spend can never overdraw.
    expect(post.guardNonNegative).toEqual([debit.accountId]);
  });

  it('records the price paid, not the price at read time', async () => {
    const { service } = build();
    const order = await service.place('b1', dto);
    expect(order.unitPriceCoins).toBe(100);
  });

  it('rejects a purchase the buyer cannot afford, before anything is charged', async () => {
    const { service, wallet, ledger } = build();
    wallet.balance.mockResolvedValue('50'); // price is 100
    await expect(service.place('b1', dto)).rejects.toThrow('Insufficient coin balance');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('attributes the sale to the live room the card was tapped in', async () => {
    const { service } = build();
    const order = await service.place('b1', { ...dto, roomId: 'r1' });
    expect(order.roomId).toBe('r1');
  });
});

describe('OrdersService.place — stock', () => {
  it('reserves stock with a conditional decrement, so the last unit cannot sell twice', async () => {
    const { service, prisma } = build();
    await service.place('b1', { ...dto, quantity: 2 });
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } }
    });
  });

  it('rejects the order when the conditional decrement matches nothing (someone else took the last unit)', async () => {
    const { service, prisma, ledger } = build();
    prisma.product.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.place('b1', dto)).rejects.toThrow('Not enough stock');
    expect(ledger.postTransaction).not.toHaveBeenCalled();
  });

  it('reserves nothing for a product with unlimited stock', async () => {
    const shop = { id: 's1', ownerUserId: 'seller', status: 'APPROVED', externalUrl: null };
    const { service, prisma } = build({
      product: { id: 'p1', status: 'ACTIVE', priceCoins: 100, stock: null, externalUrl: null, shopId: 's1', shop }
    });
    await service.place('b1', dto);
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });

  // Rule 6: a failed charge must not leave the system in an ambiguous state.
  it('releases the reserved stock when the charge fails', async () => {
    const { service, prisma, wallet } = build();
    wallet.balance.mockResolvedValue('0');
    await expect(service.place('b1', { ...dto, quantity: 3 })).rejects.toThrow('Insufficient coin balance');
    expect(prisma.product.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 3 } }
    });
  });

  it('does not release stock for an unlimited-stock product whose charge failed', async () => {
    const shop = { id: 's1', ownerUserId: 'seller', status: 'APPROVED', externalUrl: null };
    const { service, prisma, wallet } = build({
      product: { id: 'p1', status: 'ACTIVE', priceCoins: 100, stock: null, externalUrl: null, shopId: 's1', shop }
    });
    wallet.balance.mockResolvedValue('0');
    await expect(service.place('b1', dto)).rejects.toThrow('Insufficient coin balance');
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
  });
});

describe('OrdersService.place — idempotency', () => {
  // The invariant that matters most: a double-submitted checkout charges once
  // AND consumes one unit of stock, not two.
  it('returns the original order on replay without charging or reserving again', async () => {
    const { service, prisma, ledger } = build();
    prisma.ledgerTransaction.findUnique.mockResolvedValue({ id: 'tx1' });
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', totalCoins: 100 });

    const order = await service.place('b1', dto);

    expect(order).toEqual({ id: 'o1', totalCoins: 100 });
    expect(prisma.product.updateMany).not.toHaveBeenCalled();
    expect(ledger.postTransaction).not.toHaveBeenCalled();
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('probes the replay under the buyer-scoped purchase key', async () => {
    const { service, prisma } = build();
    await service.place('b1', dto);
    expect(prisma.ledgerTransaction.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'purchase:b1:k1' } });
  });

  // Two buyers reusing the string "checkout" must not collide.
  it('scopes the key to the buyer, so one buyer cannot replay another buyer of the same key', async () => {
    const { service, prisma } = build();
    await service.place('b2', dto);
    expect(prisma.ledgerTransaction.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'purchase:b2:k1' } });
  });

  // Crash window: an earlier attempt charged successfully but died before
  // writing the order row, so its stock reservation already stands. The retry
  // must not consume a second unit for the same sale.
  it('gives back the reservation when the charge replays but the order row is missing', async () => {
    const { service, prisma } = build();
    // The ledger tx exists, but no order projects it — so findReplay yields null
    // and the flow runs again, with the charge short-circuiting inside MoneyService.
    prisma.ledgerTransaction.findUnique.mockResolvedValue({ id: 'tx1' });
    prisma.order.findUnique.mockResolvedValue(null);

    const order = await service.place('b1', { ...dto, quantity: 2 });

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } }
    });
    expect(prisma.product.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'p1' },
      data: { stock: { increment: 2 } }
    });
    // Net zero stock movement, and the order finally gets written.
    expect(order.totalCoins).toBe(200);
  });

  // A concurrent duplicate can slip past the probe; the unique ledger_transaction_id
  // is the backstop that stops a second order row against one charge.
  it('returns the existing order when the projection already exists for this charge', async () => {
    const { service, prisma } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'existing' });
    const order = await service.place('b1', dto);
    expect(order).toEqual({ id: 'existing' });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService — seller share configuration', () => {
  const original = process.env.SELLER_SHARE_BPS;
  afterEach(() => {
    if (original === undefined) delete process.env.SELLER_SHARE_BPS;
    else process.env.SELLER_SHARE_BPS = original;
  });

  // Rule 10: an out-of-range or unparseable config value must not silently hand
  // away the whole sale or charge the seller more than the sale was worth.
  it.each(['-1', '10001', 'not-a-number', ''])('clamps a bad SELLER_SHARE_BPS (%s) back to the 9000 default', async (raw) => {
    process.env.SELLER_SHARE_BPS = raw;
    const { service } = build();
    const order = await service.place('b1', dto);
    expect(order.sellerNetCoins).toBe(90);
    expect(order.platformFeeCoins).toBe(10);
  });

  it.each([
    ['0', 0, 100],
    ['10000', 100, 0],
    ['5000', 50, 50]
  ])('honours a valid SELLER_SHARE_BPS of %s', async (raw, sellerNet, platformFee) => {
    process.env.SELLER_SHARE_BPS = raw as string;
    const { service } = build();
    const order = await service.place('b1', dto);
    expect(order.sellerNetCoins).toBe(sellerNet);
    expect(order.platformFeeCoins).toBe(platformFee);
  });

  // floor() on the seller's share means the remainder stays with the platform,
  // and the two legs still sum to exactly what the buyer paid.
  it('never loses a coin to rounding', async () => {
    process.env.SELLER_SHARE_BPS = '3333';
    const shop = { id: 's1', ownerUserId: 'seller', status: 'APPROVED', externalUrl: null };
    const { service } = build({
      product: { id: 'p1', status: 'ACTIVE', priceCoins: 7, stock: null, externalUrl: null, shopId: 's1', shop }
    });
    const order = await service.place('b1', dto);
    expect(order.sellerNetCoins + order.platformFeeCoins).toBe(order.totalCoins);
  });
});

describe('OrdersService.fulfil', () => {
  it('rejects fulfilling an order belonging to another shop', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue({ id: 's1' });
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', shopId: 'someone-else', status: 'PLACED' });
    await expect(service.fulfil('seller', 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects fulfilling from any state but PLACED', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue({ id: 's1' });
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', shopId: 's1', status: 'CANCELLED' });
    await expect(service.fulfil('seller', 'o1')).rejects.toThrow('already CANCELLED');
  });

  it('marks a placed order fulfilled', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue({ id: 's1' });
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', shopId: 's1', status: 'PLACED' });
    prisma.order.update.mockResolvedValue({ id: 'o1', status: 'FULFILLED' });
    await expect(service.fulfil('seller', 'o1')).resolves.toEqual({ id: 'o1', status: 'FULFILLED' });
  });

  it('rejects a seller with no shop', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue(null);
    await expect(service.fulfil('nobody', 'o1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrdersService.shopOrders', () => {
  it('scopes the seller’s order list to their own shop', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue({ id: 's1' });
    prisma.order.findMany.mockResolvedValue([]);
    await service.shopOrders('seller');
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ shopId: 's1' });
  });

  it('404s a seller with no shop', async () => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue(null);
    await expect(service.shopOrders('nobody')).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [undefined, 50],
    [0, 50],
    [5000, 100],
    [12, 12]
  ])('bounds the seller’s order list too (%s -> %s)', async (limit, expected) => {
    const { service, prisma } = build();
    prisma.shop.findUnique.mockResolvedValue({ id: 's1' });
    prisma.order.findMany.mockResolvedValue([]);
    await service.shopOrders('seller', limit as any);
    expect(prisma.order.findMany.mock.calls[0][0].take).toBe(expected);
  });
});

describe('OrdersService — bounded reads', () => {
  it('scopes the buyer’s order list to that buyer', async () => {
    const { service, prisma } = build();
    prisma.order.findMany.mockResolvedValue([]);
    await service.myOrders('b1');
    expect(prisma.order.findMany.mock.calls[0][0].where).toEqual({ buyerUserId: 'b1' });
  });


  // Same clamp expression the gifts read uses: 0 is falsy so it takes the
  // default, a negative is truthy so it lands on the floor of 1. Both are
  // bounded, which is the property that matters.
  it.each([
    [0, 50],
    [-5, 1],
    [500, 100],
    [10, 10]
  ])('clamps a limit of %s to %s', async (limit, expected) => {
    const { service, prisma } = build();
    prisma.order.findMany.mockResolvedValue([]);
    await service.myOrders('b1', limit);
    expect(prisma.order.findMany.mock.calls[0][0].take).toBe(expected);
  });
});
