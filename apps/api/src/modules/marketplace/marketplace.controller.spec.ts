import { PATH_METADATA } from '@nestjs/common/constants';
import { MarketplaceController } from './marketplace.controller';

// Regression guard for a bug that shipped and was caught only by an E2E replay:
// `@Get('shops/:slug')` was declared FIRST, so Nest — which matches routes in
// declaration order — resolved `GET /shops/me` as a lookup for a shop whose slug
// is literally "me". Every seller was told they had no shop, and the mobile
// ShopScreen could never find one.
//
// Reflecting on declaration order is the only way to assert this without booting
// the whole HTTP stack.

const routePaths = (): string[] => {
  const proto = MarketplaceController.prototype as any;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => Reflect.getMetadata(PATH_METADATA, proto[name]))
    .filter((path): path is string => typeof path === 'string');
};

describe('MarketplaceController route ordering', () => {
  it('declares every literal shops/… route before the shops/:slug wildcard', () => {
    const paths = routePaths();
    const wildcard = paths.indexOf('shops/:slug');
    expect(wildcard).toBeGreaterThanOrEqual(0); // the route still exists

    const shadowed = paths
      .map((path, index) => ({ path, index }))
      .filter(
        ({ path, index }) =>
          index > wildcard &&
          // A literal single-segment route under shops/ is what the wildcard eats.
          /^shops\/[^:]+$/.test(path)
      );

    expect(shadowed.map((s) => s.path)).toEqual([]);
  });

  // The specific route that broke. Asserted by name so the failure message says
  // what actually stops working.
  it('resolves shops/me before the wildcard could swallow it', () => {
    const paths = routePaths();
    expect(paths).toContain('shops/me');
    expect(paths.indexOf('shops/me')).toBeLessThan(paths.indexOf('shops/:slug'));
  });

  it('keeps the admin shop routes above the wildcard too', () => {
    const paths = routePaths();
    const wildcard = paths.indexOf('shops/:slug');
    for (const adminPath of paths.filter((p) => p.startsWith('admin/shops'))) {
      expect(paths.indexOf(adminPath)).toBeLessThan(wildcard);
    }
  });
});
