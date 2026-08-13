import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

function build(overrides: any = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(overrides.user ?? { id: 'u1', status: 'ACTIVE' }) },
    shop: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    product: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    liveRoom: { findUnique: jest.fn() },
    roomProductPin: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    adminAuditLog: { create: jest.fn().mockResolvedValue({}) },
    creatorProfile: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          overrides.creatorProfile === undefined ? { id: 'cp1', userId: 'u1', kycStatus: 'APPROVED', payoutEnabled: true } : overrides.creatorProfile
        )
    }
  };
  prisma.shop.findUnique.mockResolvedValue(overrides.shop === undefined ? { id: 's1', ownerUserId: 'u1', status: 'APPROVED', externalUrl: null } : overrides.shop);
  prisma.shop.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 's1', ...data }));
  prisma.product.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p1', ...data }));
  prisma.roomProductPin.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'pin1', ...data }));
  prisma.liveRoom.findUnique.mockResolvedValue(overrides.room ?? { id: 'r1', status: 'LIVE', hostUserId: 'u1' });
  return { service: new MarketplaceService(prisma), prisma };
}

describe('MarketplaceService.createShop', () => {
  it('opens a shop PENDING, so nothing is sellable before a human looked', async () => {
    const { service, prisma } = build({ shop: null });
    const shop = await service.createShop('u1', { name: 'Ada Threads' }, false);
    expect(shop.status).toBeUndefined(); // the DB default supplies PENDING
    expect(prisma.shop.create.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  // A seller who is not a creator could open a shop, sell, accrue a correctly
  // ledgered EARNING balance — and never withdraw it, because the payout gate
  // requires a creatorProfile. Every step before the withdrawal succeeded, so
  // the money trap was invisible until a merchant tried to get paid. The two
  // endpoints disagreed about who a seller is; shop creation is the side that
  // was wrong, because the marketplace is creator-led by design (a seller pins
  // their own products to their own live room).
  it('refuses a shop to an account with no creator profile — the money trap, closed at the entrance', async () => {
    const { service } = build({ shop: null, creatorProfile: null });
    await expect(service.createShop('u1', { name: 'Ada Threads' }, false)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createShop('u1', { name: 'Ada Threads' }, false)).rejects.toThrow(/creator/i);
  });

  it('refuses it for an admin acting on someone else\'s behalf too — same trap, same rule', async () => {
    const { service } = build({ shop: null, creatorProfile: null });
    await expect(service.createShop('u1', { name: 'Ada Threads' }, true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a creator whose KYC is still pending — selling is not gated on payout readiness', async () => {
    const { service } = build({ shop: null, creatorProfile: { id: 'cp1', userId: 'u1', kycStatus: 'PENDING', payoutEnabled: false } });
    await expect(service.createShop('u1', { name: 'Ada Threads' }, false)).resolves.toBeDefined();
  });

  it('rejects a suspended account', async () => {
    const { service } = build({ user: { id: 'u1', status: 'SUSPENDED' }, shop: null });
    await expect(service.createShop('u1', { name: 'Ada Threads' }, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a second shop for the same owner', async () => {
    const { service } = build(); // an existing shop is returned by default
    await expect(service.createShop('u1', { name: 'Another' }, false)).rejects.toThrow('already has a shop');
  });

  it('slugifies the name', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('u1', { name: 'Ada  Threads & Co!' }, false);
    expect(prisma.shop.create.mock.calls[0][0].data.slug).toBe('ada-threads-co');
  });

  it('suffixes a slug that is already taken instead of failing the create', async () => {
    const { service, prisma } = build({ shop: null });
    prisma.shop.findUnique
      .mockResolvedValueOnce(null) // no existing shop for this owner
      .mockResolvedValueOnce({ id: 'other', slug: 'bronzea' }); // slug taken
    await service.createShop('u1', { name: 'Bronzea' }, false);
    expect(prisma.shop.create.mock.calls[0][0].data.slug).toMatch(/^bronzea-[0-9a-f]{6}$/);
  });

  it('falls back to a usable slug for a name with no ASCII letters', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('u1', { name: '日本語' }, false);
    expect(prisma.shop.create.mock.calls[0][0].data.slug).toMatch(/^shop/);
  });

  // The referral marker decides whether a shop links out instead of selling.
  // A self-serve seller must not be able to set it on themselves.
  it('ignores externalUrl from a non-admin', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('u1', { name: 'Sneaky', externalUrl: 'https://evil.example' }, false);
    expect(prisma.shop.create.mock.calls[0][0].data.externalUrl).toBeNull();
  });

  it('honours externalUrl from an admin (this is how Bronzea is onboarded)', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('u1', { name: 'Bronzea', externalUrl: 'https://bronzea.example' }, true);
    expect(prisma.shop.create.mock.calls[0][0].data.externalUrl).toBe('https://bronzea.example');
  });

  // The admin path onboards a shop FOR someone: the owner is the named account,
  // not the admin who filled the form.
  it('sets the owner to the named account on the admin path', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('bronzea-owner', { name: 'Bronzea', externalUrl: 'https://bronzea.example' }, true);
    expect(prisma.shop.create.mock.calls[0][0].data.ownerUserId).toBe('bronzea-owner');
    // …and the owner is the account that gets status-checked, not the admin.
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'bronzea-owner' } });
  });

  it('an admin creating an ordinary shop still gets no referral marker', async () => {
    const { service, prisma } = build({ shop: null });
    await service.createShop('u1', { name: 'Plain' }, true);
    expect(prisma.shop.create.mock.calls[0][0].data.externalUrl).toBeNull();
  });
});

describe('MarketplaceService — the seller reading their own shop', () => {
  it('returns the shop as-is, whatever its status (the owner may see a pending shop)', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'PENDING', externalUrl: null } });
    await expect(service.myShop('u1')).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('returns null when the seller has no shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.myShop('u1')).resolves.toBeNull();
  });

  it('lists every product of the owner’s shop, drafts included', async () => {
    const { service, prisma } = build();
    await service.myProducts('u1');
    expect(prisma.product.findMany.mock.calls[0][0]).toEqual({
      where: { shopId: 's1' },
      orderBy: { createdAt: 'desc' }
    });
  });

  it('404s myProducts for a seller with no shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.myProducts('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketplaceService.updateShop', () => {
  it('applies only the fields that were sent', async () => {
    const { service, prisma } = build();
    prisma.shop.update.mockResolvedValue({ id: 's1' });
    await service.updateShop('u1', { name: 'Renamed' });
    expect(prisma.shop.update.mock.calls[0][0]).toEqual({ where: { id: 's1' }, data: { name: 'Renamed' } });
  });

  it('can clear the description and logo without clearing the name', async () => {
    const { service, prisma } = build();
    prisma.shop.update.mockResolvedValue({ id: 's1' });
    await service.updateShop('u1', { description: '', logoUrl: '' } as any);
    expect(prisma.shop.update.mock.calls[0][0].data).toEqual({ description: '', logoUrl: '' });
  });

  it('rejects a suspended shop', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'SUSPENDED', externalUrl: null } });
    await expect(service.updateShop('u1', { name: 'Nope' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a seller with no shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.updateShop('u1', { name: 'Nope' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketplaceService.listShops', () => {
  it('filters by status when one is given', async () => {
    const { service, prisma } = build();
    await service.listShops('PENDING' as any);
    expect(prisma.shop.findMany.mock.calls[0][0].where).toEqual({ status: 'PENDING' });
  });

  it('lists every shop when no status is given, still bounded', async () => {
    const { service, prisma } = build();
    await service.listShops();
    expect(prisma.shop.findMany.mock.calls[0][0].where).toEqual({});
    expect(prisma.shop.findMany.mock.calls[0][0].take).toBe(200);
  });

  // The review queue needs to see activity at a glance, without N+1 lookups.
  it('carries product and order counts for the review queue', async () => {
    const { service, prisma } = build();
    await service.listShops();
    expect(prisma.shop.findMany.mock.calls[0][0].include).toEqual({
      _count: { select: { products: true, orders: true } }
    });
  });
});

describe('MarketplaceService.adminShop', () => {
  it('404s an unknown shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.adminShop('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  // A reviewer decides whether this seller may take coins from viewers, so the
  // detail must name the owner rather than only their opaque id.
  it('returns the shop with its owner identified, plus a bounded product list', async () => {
    const { service, prisma } = build();
    prisma.product.findMany.mockResolvedValue([{ id: 'p1' }]);
    const detail = await service.adminShop('s1');

    expect(prisma.shop.findUnique.mock.calls[0][0].include.owner.select).toMatchObject({ id: true, email: true });
    expect(prisma.product.findMany.mock.calls[0][0]).toEqual({
      where: { shopId: 's1' },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    expect(detail.products).toEqual([{ id: 'p1' }]);
  });

  // Unlike publicShop, an unapproved shop IS visible here — reviewing it is the
  // whole point of the screen.
  it('shows a pending shop, which is exactly what needs reviewing', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'PENDING', externalUrl: null } });
    await expect(service.adminShop('s1')).resolves.toMatchObject({ shop: { status: 'PENDING' } });
  });
});

describe('MarketplaceService.publicShop', () => {
  it('404s a shop that is not approved', async () => {
    const { service } = build({ shop: { id: 's1', status: 'PENDING' } });
    await expect(service.publicShop('ada')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s an unknown slug', async () => {
    const { service } = build({ shop: null });
    await expect(service.publicShop('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only ACTIVE products of an approved shop', async () => {
    const { service, prisma } = build();
    await service.publicShop('ada');
    expect(prisma.product.findMany.mock.calls[0][0].where).toEqual({ shopId: 's1', status: 'ACTIVE' });
  });
});

describe('MarketplaceService.createProduct', () => {
  it('rejects an in-app product in a referral shop', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'APPROVED', externalUrl: 'https://bronzea.example' } });
    await expect(service.createProduct('u1', { title: 'Tee', priceCoins: 10 })).rejects.toThrow('must have an externalUrl');
  });

  it('rejects a link-out product in a normal shop', async () => {
    const { service } = build();
    await expect(
      service.createProduct('u1', { title: 'Tee', priceCoins: 10, externalUrl: 'https://elsewhere.example' })
    ).rejects.toThrow('Only a referral shop');
  });

  it('rejects a seller with no shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.createProduct('u1', { title: 'Tee', priceCoins: 10 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a suspended shop', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'SUSPENDED', externalUrl: null } });
    await expect(service.createProduct('u1', { title: 'Tee', priceCoins: 10 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores omitted stock as null (unlimited), not as zero', async () => {
    const { service } = build();
    const product = await service.createProduct('u1', { title: 'Tee', priceCoins: 10 });
    expect(product.stock).toBeNull();
  });
});

describe('MarketplaceService.updateProduct', () => {
  // Rule: a seller must not be able to edit another shop's product by id.
  it('404s a product belonging to another shop', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 'someone-else' });
    await expect(service.updateProduct('u1', 'p1', { priceCoins: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies only the fields that were sent', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1' });
    await service.updateProduct('u1', 'p1', { priceCoins: 42 });
    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ priceCoins: 42 });
  });

  it('carries every editable field through when all are sent', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1' });
    const dto = {
      title: 'Tee v2',
      description: 'now in navy',
      imageUrl: 'https://cdn.example/t.png',
      priceCoins: 42,
      stock: 7,
      status: 'ACTIVE' as any
    };
    await service.updateProduct('u1', 'p1', dto);
    expect(prisma.product.update.mock.calls[0][0].data).toEqual(dto);
  });

  // Archiving must not require re-sending the price — a partial update that
  // omits priceCoins has to leave the stored price alone.
  it('archives a product without touching its price', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1' });
    await service.updateProduct('u1', 'p1', { status: 'ARCHIVED' as any });
    expect(prisma.product.update.mock.calls[0][0].data).toEqual({ status: 'ARCHIVED' });
  });

  it('404s when the product does not exist at all', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.updateProduct('u1', 'p1', { priceCoins: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketplaceService.pinProduct', () => {
  it('404s an unknown room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.pinProduct('u1', 'nope', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s an unknown product', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(service.pinProduct('u1', 'r1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-host pinning to a room', async () => {
    const { service } = build({ room: { id: 'r1', status: 'LIVE', hostUserId: 'someone-else' } });
    await expect(service.pinProduct('u1', 'r1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects pinning to a room that is not live', async () => {
    const { service } = build({ room: { id: 'r1', status: 'SCHEDULED', hostUserId: 'u1' } });
    await expect(service.pinProduct('u1', 'r1', 'p1')).rejects.toThrow('Room is not live');
  });

  it('rejects pinning from a shop that is not approved', async () => {
    const { service } = build({ shop: { id: 's1', ownerUserId: 'u1', status: 'PENDING', externalUrl: null } });
    await expect(service.pinProduct('u1', 'r1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects pinning another shop's product", async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 'someone-else', status: 'ACTIVE' });
    await expect(service.pinProduct('u1', 'r1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects pinning a product that is not active', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1', status: 'DRAFT' });
    await expect(service.pinProduct('u1', 'r1', 'p1')).rejects.toThrow('not active');
  });

  it('is idempotent: pinning twice returns the open pin rather than creating a second', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1', status: 'ACTIVE' });
    prisma.roomProductPin.findFirst.mockResolvedValue({ id: 'existing-pin' });
    await expect(service.pinProduct('u1', 'r1', 'p1')).resolves.toEqual({ id: 'existing-pin' });
    expect(prisma.roomProductPin.create).not.toHaveBeenCalled();
  });

  it('pins a live, owned, active product', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1', shopId: 's1', status: 'ACTIVE' });
    const pin = await service.pinProduct('u1', 'r1', 'p1');
    expect(pin).toMatchObject({ roomId: 'r1', productId: 'p1' });
  });
});

describe('MarketplaceService.unpinProduct', () => {
  it('404s an unknown room', async () => {
    const { service, prisma } = build();
    prisma.liveRoom.findUnique.mockResolvedValue(null);
    await expect(service.unpinProduct('u1', 'nope', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a non-host', async () => {
    const { service } = build({ room: { id: 'r1', status: 'LIVE', hostUserId: 'someone-else' } });
    await expect(service.unpinProduct('u1', 'r1', 'p1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when nothing is pinned', async () => {
    const { service } = build();
    await expect(service.unpinProduct('u1', 'r1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // Soft close, so a sale attributed to this pin still has its history.
  it('closes the pin with a timestamp rather than deleting it', async () => {
    const { service, prisma } = build();
    prisma.roomProductPin.findFirst.mockResolvedValue({ id: 'pin1' });
    prisma.roomProductPin.update.mockResolvedValue({ id: 'pin1', unpinnedAt: new Date() });
    await service.unpinProduct('u1', 'r1', 'p1');
    expect(prisma.roomProductPin.update.mock.calls[0][0].data.unpinnedAt).toBeInstanceOf(Date);
  });
});

describe('MarketplaceService.roomPins', () => {
  const pin = (over: any = {}) => ({
    id: 'pin1',
    pinnedAt: new Date(0),
    product: {
      id: 'p1',
      title: 'Tee',
      imageUrl: null,
      priceCoins: 100,
      stock: 3,
      externalUrl: null,
      status: 'ACTIVE',
      shop: { id: 's1', name: 'Ada', slug: 'ada', status: 'APPROVED' },
      ...over.product
    },
    ...over
  });

  it('queries only pins that are still open', async () => {
    const { service, prisma } = build();
    await service.roomPins('r1');
    expect(prisma.roomProductPin.findMany.mock.calls[0][0].where).toEqual({ roomId: 'r1', unpinnedAt: null });
  });

  // A stale pin must not resurface something that was pulled after it was pinned.
  it('drops a pin whose product was archived', async () => {
    const { service, prisma } = build();
    prisma.roomProductPin.findMany.mockResolvedValue([pin({ product: { status: 'ARCHIVED' } })]);
    await expect(service.roomPins('r1')).resolves.toEqual([]);
  });

  it('drops a pin whose shop was suspended', async () => {
    const { service, prisma } = build();
    prisma.roomProductPin.findMany.mockResolvedValue([
      pin({ product: { shop: { id: 's1', name: 'Ada', slug: 'ada', status: 'SUSPENDED' } } })
    ]);
    await expect(service.roomPins('r1')).resolves.toEqual([]);
  });

  it('returns a live pin as a card the client can render', async () => {
    const { service, prisma } = build();
    prisma.roomProductPin.findMany.mockResolvedValue([pin()]);
    const [card] = await service.roomPins('r1');
    expect(card).toMatchObject({
      pinId: 'pin1',
      product: { id: 'p1', title: 'Tee', priceCoins: 100, stock: 3 },
      shop: { slug: 'ada' }
    });
  });
});

describe('MarketplaceService.recordClick', () => {
  const referral = {
    id: 'p1',
    status: 'ACTIVE',
    externalUrl: 'https://bronzea.example/p1',
    shop: { status: 'APPROVED' }
  };

  it('returns the destination and counts the tap', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue(referral);
    await expect(service.recordClick('p1')).resolves.toEqual({ url: 'https://bronzea.example/p1' });
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { clickCount: { increment: 1 } } });
  });

  it('rejects a product that is bought in-app — there is nowhere to send the viewer', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ ...referral, externalUrl: null });
    await expect(service.recordClick('p1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s a product in an unapproved shop, and counts nothing', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ ...referral, shop: { status: 'PENDING' } });
    await expect(service.recordClick('p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('404s an archived product', async () => {
    const { service, prisma } = build();
    prisma.product.findUnique.mockResolvedValue({ ...referral, status: 'ARCHIVED' });
    await expect(service.recordClick('p1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MarketplaceService.setShopStatus', () => {
  it('404s an unknown shop', async () => {
    const { service } = build({ shop: null });
    await expect(service.setShopStatus('admin', 's1', 'APPROVED' as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  // This is the gate that decides who may take money from viewers, so it is audited.
  it('audits the transition with both the old and the new status', async () => {
    const { service, prisma } = build();
    prisma.shop.update.mockResolvedValue({ id: 's1', status: 'APPROVED' });
    await service.setShopStatus('admin', 's1', 'APPROVED' as any);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: { actorId: 'admin', action: 'shop.status_changed', target: 's1', metadata: { from: 'APPROVED', to: 'APPROVED' } }
    });
  });
});
