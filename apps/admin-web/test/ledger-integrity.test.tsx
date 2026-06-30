import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import LedgerIntegrityPage from '../app/ledger-integrity/page';

afterEach(() => vi.clearAllMocks());

function mock(impl: (path: string) => unknown) {
  vi.mocked(adminGet).mockImplementation((path: string) => Promise.resolve(impl(path)) as any);
}

describe('LedgerIntegrityPage', () => {
  it('shows loading until integrity resolves', () => {
    vi.mocked(adminGet).mockReturnValue(new Promise(() => {}));
    render(<LedgerIntegrityPage />);
    expect(screen.getByText('Checking ledger integrity…')).toBeInTheDocument();
  });

  it('renders error when transactions reject', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('transactions') ? Promise.reject(new Error('tx-fail')) : Promise.resolve({ ok: true, unbalancedTransactions: 0 }) as any
    );
    render(<LedgerIntegrityPage />);
    expect(await screen.findByText('tx-fail')).toBeInTheDocument();
  });

  it('renders error when integrity rejects', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path.includes('transactions') ? Promise.resolve([]) as any : Promise.reject(new Error('integrity-fail'))
    );
    render(<LedgerIntegrityPage />);
    expect(await screen.findByText('integrity-fail')).toBeInTheDocument();
  });

  it('ok integrity, no imbalanced rows -> empty state', async () => {
    mock((path) =>
      path.includes('transactions')
        ? [
            {
              id: 'tx-ok',
              type: 'PAYOUT',
              status: 'OK',
              createdAt: '2024-01-01T00:00:00Z',
              entries: [
                { direction: 'DEBIT', amountMinor: 100 },
                { direction: 'CREDIT', amountMinor: 100 }
              ]
            }
          ]
        : { ok: true, unbalancedTransactions: 0 }
    );
    render(<LedgerIntegrityPage />);
    expect(await screen.findByText('Ledger balanced')).toBeInTheDocument();
    expect(screen.getByText('Ledger balanced. No imbalanced transactions detected.')).toBeInTheDocument();
  });

  it('not-ok integrity with imbalanced rows: users present and users-empty branches', async () => {
    mock((path) =>
      path.includes('transactions')
        ? [
            {
              id: 'tx-with-users',
              type: 'GIFT',
              status: 'OK',
              createdAt: '2024-01-01T00:00:00Z',
              entries: [
                { direction: 'DEBIT', amountMinor: 500, account: { userId: 'user-abcdef123456' } },
                { direction: 'CREDIT', amountMinor: 100, account: { userId: undefined } }
              ]
            },
            {
              id: 'tx-no-users',
              type: 'ADJUST',
              status: 'OK',
              createdAt: '2024-01-02T00:00:00Z',
              entries: [{ direction: 'DEBIT', amountMinor: 50 }]
              // no account.userId -> users empty -> '—'
            }
          ]
        : { ok: false, unbalancedTransactions: 2 }
    );
    render(<LedgerIntegrityPage />);
    expect(await screen.findByText('Ledger imbalance detected')).toBeInTheDocument();
    expect(screen.getByText('user-abc')).toBeInTheDocument(); // sliced userId
    expect(screen.getByText('—')).toBeInTheDocument(); // empty users branch
    expect(screen.getAllByText('Disable payout approvals until resolved.').length).toBe(2);
  });
});
