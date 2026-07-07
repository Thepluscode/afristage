import { MetricsService } from '../metrics/metrics.service';
import { LedgerIntegrityService } from './ledger-integrity.service';

function build(grouped: any[] = [], imbalancedRows: any[] = [], drift: any[] = []) {
  const prisma: any = {
    ledgerEntry: { groupBy: jest.fn().mockResolvedValue(grouped) },
    // check() issues two raw queries: per-transaction balance and the
    // materialised-balance drift scan — route by the table each one reads.
    $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join('').includes('wallet_accounts') ? drift : imbalancedRows))
  };
  return { service: new LedgerIntegrityService(prisma, new MetricsService()), prisma };
}

describe('LedgerIntegrityService.check', () => {
  it('reports OK when every currency nets to zero and all transactions balance', async () => {
    const { service } = build([
      { currency: 'COIN', direction: 'DEBIT', _sum: { amountMinor: 1000n } },
      { currency: 'COIN', direction: 'CREDIT', _sum: { amountMinor: 1000n } }
    ]);
    const res = await service.check();
    expect(res.ok).toBe(true);
    expect(res.currencies).toEqual([{ currency: 'COIN', debits: '1000', credits: '1000', balanced: true }]);
    expect(res.unbalancedTransactions).toBe(0);
  });

  it('fails when a currency’s debits and credits diverge', async () => {
    const { service } = build([
      { currency: 'COIN', direction: 'DEBIT', _sum: { amountMinor: 1000n } },
      { currency: 'COIN', direction: 'CREDIT', _sum: { amountMinor: 900n } }
    ]);
    const res = await service.check();
    expect(res.ok).toBe(false);
    expect(res.currencies[0].balanced).toBe(false);
  });

  it('fails and lists imbalanced transactions when any single txn does not balance', async () => {
    const { service } = build(
      [
        { currency: 'COIN', direction: 'DEBIT', _sum: { amountMinor: 1000n } },
        { currency: 'COIN', direction: 'CREDIT', _sum: { amountMinor: 1000n } }
      ],
      [{ transaction_id: 'tx-bad', debit: 100n, credit: 90n }]
    );
    const res = await service.check();
    expect(res.ok).toBe(false);
    expect(res.unbalancedTransactions).toBe(1);
    expect(res.imbalancedTransactions).toEqual([{ id: 'tx-bad', debit: '100', credit: '90' }]);
  });

  it('treats a null grouped sum as zero', async () => {
    const { service } = build([
      { currency: 'COIN', direction: 'DEBIT', _sum: { amountMinor: null } },
      { currency: 'COIN', direction: 'CREDIT', _sum: { amountMinor: null } }
    ]);
    const res = await service.check();
    expect(res.currencies[0]).toMatchObject({ debits: '0', credits: '0', balanced: true });
  });

  it('reports OK with no currencies for an empty ledger', async () => {
    const { service } = build([], []);
    const res = await service.check();
    expect(res.ok).toBe(true);
    expect(res.currencies).toEqual([]);
    expect(res.driftedAccounts).toEqual([]);
  });

  it('fails and lists accounts whose materialised balance drifts from the entry sums', async () => {
    const { service } = build(
      [
        { currency: 'COIN', direction: 'DEBIT', _sum: { amountMinor: 1000n } },
        { currency: 'COIN', direction: 'CREDIT', _sum: { amountMinor: 1000n } }
      ],
      [],
      [{ id: 'acc-drift', materialised: 500n, from_entries: 480n }]
    );
    const res = await service.check();
    expect(res.ok).toBe(false); // balanced ledger, but a drifted account still fails
    expect(res.driftedAccounts).toEqual([{ id: 'acc-drift', materialised: '500', fromEntries: '480' }]);
  });
});

describe('LedgerIntegrityService.getLast / scheduledCheck', () => {
  it('returns null before any check has run', () => {
    const { service } = build();
    expect(service.getLast()).toBeNull();
  });

  it('caches the last result and the scheduled job reuses check()', async () => {
    const { service, prisma } = build([], []);
    await service.scheduledCheck();
    expect(prisma.ledgerEntry.groupBy).toHaveBeenCalledTimes(1);
    expect(service.getLast()).toMatchObject({ ok: true });
  });
});
describe('LedgerIntegrityService boot sweep', () => {
  it('onModuleInit runs a sweep so gauges are truthful from the first scrape', async () => {
    const { service } = build();
    const spy = jest.spyOn(service, 'check').mockResolvedValue({ ok: true } as any);
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });

  it('a failing boot sweep is logged, never thrown into startup', async () => {
    const { service } = build();
    jest.spyOn(service, 'check').mockRejectedValue(new Error('db not up yet'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    // a non-Error rejection (no .message) is also swallowed
    jest.spyOn(service, 'check').mockRejectedValue('exploded');
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

