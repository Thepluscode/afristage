import { RANKING_WEIGHTS, RoomFeatures, scoreRoom } from './ranking';

const base: RoomFeatures = {
  activeViewers: 0,
  avgWatchMinutes: 0,
  giftCoinsPerMin: 0,
  languageMatch: false,
  countryMatch: false,
  followsHost: false,
  creatorAgeDays: null,
  reportRiskPoints: 0
};

describe('scoreRoom', () => {
  it('an empty room scores 0', () => {
    expect(scoreRoom(base).score).toBe(0);
  });

  it('a maxed-out clean room scores the sum of positive weights', () => {
    const positive = Object.entries(RANKING_WEIGHTS)
      .filter(([, w]) => w > 0)
      .reduce((a, [, w]) => a + w, 0);
    const full = scoreRoom({
      activeViewers: 1000, // > scale -> capped at 1
      avgWatchMinutes: 60,
      giftCoinsPerMin: 5000,
      languageMatch: true,
      countryMatch: true,
      followsHost: true,
      creatorAgeDays: 0, // brand new -> full boost
      reportRiskPoints: 0
    });
    expect(full.score).toBeCloseTo(positive, 5);
  });

  it('report risk pulls a room below an otherwise-identical clean room', () => {
    const clean = scoreRoom({ ...base, activeViewers: 100 });
    const flagged = scoreRoom({ ...base, activeViewers: 100, reportRiskPoints: 3 });
    expect(flagged.score).toBeLessThan(clean.score);
    // full risk applies the entire -0.30 weight
    expect(clean.score - flagged.score).toBeCloseTo(0.3, 5);
  });

  it('a heavily-reported popular room ranks below a quiet clean room', () => {
    const popularButFlagged = scoreRoom({
      ...base,
      activeViewers: 200,
      giftCoinsPerMin: 500,
      reportRiskPoints: 9 // way over scale -> capped, full -0.30
    });
    const quietClean = scoreRoom({ ...base, activeViewers: 40, languageMatch: true });
    expect(quietClean.score).toBeGreaterThan(popularButFlagged.score);
  });

  it('language + country personalization changes ranking between identical rooms', () => {
    const matched = scoreRoom({ ...base, activeViewers: 50, languageMatch: true, countryMatch: true });
    const unmatched = scoreRoom({ ...base, activeViewers: 50 });
    expect(matched.score - unmatched.score).toBeCloseTo(RANKING_WEIGHTS.languageMatch + RANKING_WEIGHTS.countryMatch, 5);
  });

  it('new-creator boost decays with age and is null-safe', () => {
    const fresh = scoreRoom({ ...base, creatorAgeDays: 0 });
    const week = scoreRoom({ ...base, creatorAgeDays: 7 });
    const old = scoreRoom({ ...base, creatorAgeDays: 30 });
    const unknown = scoreRoom({ ...base, creatorAgeDays: null });
    expect(fresh.score).toBeGreaterThan(week.score);
    expect(week.score).toBeGreaterThan(old.score);
    expect(old.score).toBe(0); // past the 14-day window -> no boost
    expect(unknown.score).toBe(0);
  });

  it('exposes a per-component breakdown that sums to the score', () => {
    const { score, components } = scoreRoom({ ...base, activeViewers: 100, reportRiskPoints: 1 });
    const sum = Object.values(components).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(score, 10);
    expect(components.reportRisk).toBeLessThan(0); // penalty is negative
  });
});
