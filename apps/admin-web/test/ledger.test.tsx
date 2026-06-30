import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import LedgerPage from '../app/ledger/page';

afterEach(() => vi.clearAllMocks());

function mock(impl: (path: string) => unknown) {
  vi.mocked(adminGet).mockImplementation((path: string) => Promise.resolve(impl(path)) as any);
}

describe('LedgerPage', () => {
  it('renders error state when transactions fetch rejects', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('transactions') ? Promise.reject(new Error('ledger-boom')) : Promise.resolve({ ok: true, unbalancedTransactions: 0 }) as any
    );
    render(<LedgerPage />);
    expect(await screen.findByText('ledger-boom')).toBeInTheDocument();
  });

  it('integrity fetch failure is swallowed; table still renders', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('transactions') ? Promise.resolve([]) as any : Promise.reject(new Error('ignored'))
    );
    render(<LedgerPage />);
    expect(await screen.findByText('No ledger transactions.')).toBeInTheDocument();
    // integrity null -> panel not rendered
    expect(screen.queryByText('Ledger balanced')).not.toBeInTheDocument();
  });

  it('renders integrity panel (ok) and balanced + imbalanced rows, with entries fallback', async () => {
    mock((path) => {
      if (path.includes('transactions')) {
        return [
          {
            id: 'tx-balanced',
            type: 'PAYOUT',
            status: 'SUCCEEDED',
            externalReference: 'EXT-1',
            createdAt: '2024-01-01T00:00:00Z',
            entries: [
              { direction: 'DEBIT', amountMinor: 100 },
              { direction: 'CREDIT', amountMinor: 100 }
            ]
          },
          {
            id: 'tx-imbalanced',
            type: 'GIFT',
            status: 'SUCCEEDED',
            // no externalReference -> '—'
            createdAt: '2024-01-02T00:00:00Z',
            entries: [{ direction: 'DEBIT', amountMinor: 100 }]
          },
          {
            id: 'tx-no-entries',
            type: 'ADJUST',
            status: 'PENDING',
            externalReference: null,
            createdAt: '2024-01-03T00:00:00Z'
            // entries undefined -> sum default [], length ?? 0
          }
        ];
      }
      return { ok: true, unbalancedTransactions: 0 };
    });
    const { container } = render(<LedgerPage />);
    expect(await screen.findByText('Ledger balanced')).toBeInTheDocument();
    expect(screen.getByText('EXT-1')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // null + undefined externalReference
    // imbalanced row gets IMBALANCED status + class
    expect(screen.getByText('IMBALANCED')).toBeInTheDocument();
    expect(container.querySelectorAll('tr.ledger-imbalance').length).toBe(1);
  });
});
