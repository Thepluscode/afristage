import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet } from '../lib/api';
import DashboardPage from '../app/page';

type Dash = Record<string, unknown>;

const baseDash = {
  activeRooms: 0,
  pendingReports: 0,
  criticalReports: 0,
  pendingPayouts: 0,
  successfulPayments: 0,
  failedPayments: 0,
  grossGiftVolumeCoins: 0,
  newUsersToday: 0,
  newCreatorsToday: 0
};

function wire(opts: {
  dash?: Dash | 'reject';
  integrity?: unknown | 'reject';
  series?: unknown | 'reject';
}) {
  vi.mocked(adminGet).mockImplementation((p: string) => {
    if (p === '/admin/dashboard') {
      return opts.dash === 'reject'
        ? Promise.reject(new Error('dash boom'))
        : Promise.resolve(opts.dash ?? baseDash);
    }
    if (p.includes('integrity')) {
      return opts.integrity === 'reject'
        ? Promise.reject(new Error('integrity boom'))
        : Promise.resolve(opts.integrity ?? { ok: true, unbalancedTransactions: 0 });
    }
    // analytics series
    return opts.series === 'reject'
      ? Promise.reject(new Error('series boom'))
      : Promise.resolve(opts.series ?? []);
  });
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('DashboardPage', () => {
  it('shows the loading state before data resolves', () => {
    // dashboard never resolves within this synchronous render
    vi.mocked(adminGet).mockImplementation(() => new Promise(() => {}));
    render(<DashboardPage />);
    expect(screen.getByText('Loading operations dashboard…')).toBeInTheDocument();
  });

  it('shows the error state when the dashboard fetch rejects', async () => {
    wire({ dash: 'reject' });
    render(<DashboardPage />);
    expect(await screen.findByText('dash boom')).toBeInTheDocument();
  });

  it('renders the success state and tolerates failing optional widgets', async () => {
    wire({
      dash: {
        ...baseDash,
        activeRooms: 5,
        criticalReports: 2,
        pendingPayouts: 3,
        failedPayments: 1,
        openSupportTickets: 4,
        pendingCreatorApprovals: 6,
        successfulPayments: 9,
        grossGiftVolumeCoins: 100,
        newUsersToday: 12
      },
      integrity: 'reject',
      series: 'reject'
    });
    render(<DashboardPage />);

    expect(await screen.findByText('Operations Dashboard')).toBeInTheDocument();
    // metric cards present
    expect(screen.getByText('Active rooms')).toBeInTheDocument();
    expect(screen.getByText('Creator approvals')).toBeInTheDocument();
    // "Critical reports" appears in both the metric card and the queue table
    expect(screen.getAllByText('Critical reports').length).toBeGreaterThan(0);
    expect(screen.getByText('Open support')).toBeInTheDocument();
    expect(screen.getByText('100 COIN')).toBeInTheDocument();

    // optional widget catch branches logged warnings
    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        'Optional ledger integrity widget failed to load',
        expect.any(Error)
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Optional analytics series widget failed to load',
        expect.any(Error)
      );
    });

    // danger banner (critical + failed > 0)
    expect(screen.getByText(/critical report\(s\) and/)).toBeInTheDocument();
    // ledger alert shows the placeholder dots while integrity is null
    expect(screen.getByText('…')).toBeInTheDocument();
    // ledger sidebar shows the "checking" copy while integrity is null
    expect(screen.getByText('Checking ledger integrity…')).toBeInTheDocument();
  });

  it('renders the warning banner when only payouts are pending', async () => {
    wire({ dash: { ...baseDash, pendingPayouts: 2 } });
    render(<DashboardPage />);
    expect(await screen.findByText(/payout request\(s\) need audit-friendly review/)).toBeInTheDocument();
  });

  it('renders the success banner and "good" tones at zero across the board', async () => {
    wire({ dash: baseDash, integrity: { ok: true, unbalancedTransactions: 0 } });
    render(<DashboardPage />);
    expect(await screen.findByText(/inside normal operating range/)).toBeInTheDocument();
    // queue pills show the "Clear" success state
    expect(screen.getAllByText('Clear').length).toBeGreaterThan(0);
    // creator approvals card falls back to newCreatorsToday when approvals absent
    expect(screen.getByText('Creator approvals')).toBeInTheDocument();
    // ledger balanced sidebar copy + balanced alert value
    expect(screen.getByText('Balanced across transaction entries.')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
    // payout risk overview clear copy
    expect(screen.getByText('No payout or payment blocker detected.')).toBeInTheDocument();
  });

  it('renders the series insight grid, BarRows and imbalanced ledger', async () => {
    wire({
      dash: {
        ...baseDash,
        successfulPayments: 7,
        failedPayments: 3,
        grossGiftVolumeCoins: 250
      },
      integrity: { ok: false, unbalancedTransactions: 8 },
      series: [
        { day: 'd1', newUsers: 4, giftCount: 1, giftVolumeCoins: 10 },
        { day: 'd2', newUsers: 6, giftCount: 2, giftVolumeCoins: 20 }
      ]
    });
    render(<DashboardPage />);

    expect(await screen.findByText('Growth (30 days)')).toBeInTheDocument();
    expect(screen.getByText('Live economy')).toBeInTheDocument();
    // BarRow labels ("Gift volume" / "Failed payments" also appear as card labels)
    expect(screen.getAllByText('Gift volume').length).toBeGreaterThan(0);
    expect(screen.getByText('Successful payments')).toBeInTheDocument();
    expect(screen.getAllByText('Failed payments').length).toBeGreaterThan(0);
    // imbalanced ledger sidebar + alert
    expect(screen.getByText('8 transaction(s) out of balance.')).toBeInTheDocument();
    expect(screen.getByText('Ledger imbalance')).toBeInTheDocument();
    expect(screen.getByText('8 off')).toBeInTheDocument();
  });

  it('covers the grossGiftVolumeCoins zero-fallback in BarRow max', async () => {
    // grossGiftVolumeCoins of 0 forces `Number(...) || 0` and Math.max(..,1) branches
    wire({
      dash: { ...baseDash, grossGiftVolumeCoins: 0, successfulPayments: 0, failedPayments: 0 },
      series: [{ day: 'd1', newUsers: 1, giftCount: 0, giftVolumeCoins: 0 }]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Live economy')).toBeInTheDocument();
  });
});
