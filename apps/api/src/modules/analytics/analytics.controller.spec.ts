import { AnalyticsController } from './analytics.controller';
describe('AnalyticsController', () => {
  it('delegates overview + series (explicit + default days)', () => {
    const s = { overview: jest.fn(), dailySeries: jest.fn() };
    const c = new AnalyticsController(s as any);
    c.overview(); c.series('7'); c.series();
    expect(s.dailySeries).toHaveBeenNthCalledWith(1, 7);
    expect(s.dailySeries).toHaveBeenNthCalledWith(2, 30);
  });
});
