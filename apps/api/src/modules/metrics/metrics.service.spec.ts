import { BadRequestException } from '@nestjs/common';
import { MetricsService } from './metrics.service';

const metricLine = async (m: MetricsService, needle: string) =>
  (await m.render()).split('\n').filter((l) => l.includes(needle) && !l.startsWith('#'));

describe('MetricsService.trackMove', () => {
  it('records settled moves with duration and coin volume', async () => {
    const m = new MetricsService();
    const res = await m.trackMove('giftSplit', () => 100, async () => ({ replayed: false, ok: true }));
    expect(res.ok).toBe(true);
    expect(await metricLine(m, 'money_moves_total{move="giftSplit",outcome="settled"}')).toHaveLength(1);
    expect((await metricLine(m, 'money_move_coins_total{move="giftSplit"}'))[0]).toContain('100');
    expect((await metricLine(m, 'money_move_duration_seconds_count{move="giftSplit"}'))[0]).toContain('1');
  });

  it('a replayed move counts as replayed and moves NO coins', async () => {
    const m = new MetricsService();
    await m.trackMove('giftSplit', () => 100, async () => ({ replayed: true }));
    expect(await metricLine(m, 'outcome="replayed"')).toHaveLength(1);
    expect(await metricLine(m, 'money_move_coins_total')).toHaveLength(0);
  });

  it('a 4xx throw counts as rejected, anything else as failed — and rethrows', async () => {
    const m = new MetricsService();
    await expect(
      m.trackMove('missionReward', () => 10, async () => { throw new BadRequestException('Insufficient balance'); })
    ).rejects.toThrow('Insufficient balance');
    await expect(
      m.trackMove('missionReward', () => 10, async () => { throw new Error('db down'); })
    ).rejects.toThrow('db down');
    expect(await metricLine(m, 'outcome="rejected"')).toHaveLength(1);
    expect(await metricLine(m, 'outcome="failed"')).toHaveLength(1);
  });

  it('a metrics recording failure never fails the money move', async () => {
    const m = new MetricsService();
    (m.moneyMoves as any).inc = () => { throw new Error('registry exploded'); };
    const res = await m.trackMove('promoFund', () => 5, async () => ({ replayed: false }));
    expect(res.replayed).toBe(false); // move still succeeded
  });
});

describe('MetricsService.recordIntegrity', () => {
  it('exposes the sweep verdict as gauges', async () => {
    const m = new MetricsService();
    m.recordIntegrity({ ok: false, unbalancedTransactions: 2, driftedAccounts: [{}, {}, {}] });
    expect((await metricLine(m, 'ledger_integrity_ok'))[0]).toContain('0');
    expect((await metricLine(m, 'ledger_unbalanced_transactions'))[0]).toContain('2');
    expect((await metricLine(m, 'ledger_drifted_accounts'))[0]).toContain('3');
    m.recordIntegrity({ ok: true, unbalancedTransactions: 0, driftedAccounts: [] });
    expect((await metricLine(m, 'ledger_integrity_ok'))[0]).toContain('1');
    expect((await metricLine(m, 'last_check_timestamp_seconds'))[0]).not.toContain(' 0');
  });
});
