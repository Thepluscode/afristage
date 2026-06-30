import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet } from '../lib/api';
import BetaOpsPage from '../app/beta-ops/page';

const ops = (over: Record<string, number> = {}) => ({
  activeRooms: 0,
  pendingCreatorApprovals: 0,
  pendingReports: 0,
  criticalReports: 0,
  pendingPayouts: 0,
  openSupportTickets: 0,
  paymentFailures: 0,
  bannedUsers: 0,
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue(ops());
});
afterEach(() => vi.restoreAllMocks());

describe('BetaOpsPage', () => {
  it('shows the loading state before data resolves', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(adminGet).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<BetaOpsPage />);
    expect(screen.getByText('Loading beta ops…')).toBeInTheDocument();
    resolve(ops());
    expect(await screen.findByText('Beta Control Room')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('ops down'));
    render(<BetaOpsPage />);
    expect(await screen.findByText('ops down')).toBeInTheDocument();
  });

  it('shows the success banner and neutral/good tones when everything is zero', async () => {
    vi.mocked(adminGet).mockResolvedValue(ops());
    render(<BetaOpsPage />);
    expect(await screen.findByText('No critical reports in the beta queue.')).toBeInTheDocument();
    // active rooms 0 -> neutral, all others 0 -> good
    expect(screen.getByText('Active rooms')).toBeInTheDocument();
  });

  it('shows the danger banner when there are critical reports', async () => {
    vi.mocked(adminGet).mockResolvedValue(ops({ criticalReports: 3 }));
    render(<BetaOpsPage />);
    expect(await screen.findByText('3 critical report(s) need immediate moderation action.')).toBeInTheDocument();
  });

  it('shows the warning banner when there are payment failures but no critical reports', async () => {
    vi.mocked(adminGet).mockResolvedValue(ops({ paymentFailures: 2 }));
    render(<BetaOpsPage />);
    expect(await screen.findByText('2 payment failure(s) need provider investigation.')).toBeInTheDocument();
  });

  it('exercises the positive (warn/danger/good) card tones', async () => {
    vi.mocked(adminGet).mockResolvedValue(
      ops({
        activeRooms: 4,
        pendingCreatorApprovals: 1,
        pendingReports: 1,
        criticalReports: 1,
        pendingPayouts: 1,
        openSupportTickets: 1,
        paymentFailures: 1,
        bannedUsers: 9
      })
    );
    render(<BetaOpsPage />);
    // critical > 0 -> danger banner takes precedence
    expect(await screen.findByText('1 critical report(s) need immediate moderation action.')).toBeInTheDocument();
    expect(screen.getByText('Active rooms')).toBeInTheDocument();
    expect(screen.getByText('Banned users')).toBeInTheDocument();
  });
});
