import { isDevOrTest, isExplicitProduction, isProductionLike } from './environment';

// The whole point: an ABSENT NODE_ENV must not read as "safe to relax".
describe('environment classification (fails closed)', () => {
  it('treats unset as production-like — the case that shipped free coins', () => {
    expect(isProductionLike({})).toBe(true);
    expect(isProductionLike({ NODE_ENV: '' })).toBe(true);
    expect(isProductionLike({ NODE_ENV: '   ' })).toBe(true);
  });

  it('treats a typo or unknown value as production-like, not as dev', () => {
    expect(isProductionLike({ NODE_ENV: 'prod' })).toBe(true);
    expect(isProductionLike({ NODE_ENV: 'staging' })).toBe(true);
    expect(isProductionLike({ NODE_ENV: 'developmnet' })).toBe(true); // misspelled on purpose
  });

  it('relaxes only when the environment says development or test in so many words', () => {
    expect(isProductionLike({ NODE_ENV: 'development' })).toBe(false);
    expect(isProductionLike({ NODE_ENV: 'test' })).toBe(false);
    expect(isProductionLike({ NODE_ENV: 'DEVELOPMENT' })).toBe(false);
    expect(isDevOrTest({ NODE_ENV: 'test' })).toBe(true);
  });

  it('keeps "explicitly production" separate — for log lines, never for a gate', () => {
    expect(isExplicitProduction({})).toBe(false);
    expect(isExplicitProduction({ NODE_ENV: 'production' })).toBe(true);
  });
});
