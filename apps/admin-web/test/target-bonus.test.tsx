import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));

import { adminGet, adminPost } from '../lib/api';
import TargetBonusPage from '../app/target-bonus/page';

afterEach(() => vi.restoreAllMocks());

const TIERS = [
  { minGiftCoins: 10000, bonusCoins: 500 },
  { minGiftCoins: 50000, bonusCoins: 3000 }
];

const month = (over: Partial<any> = {}) => ({
  month: '2026-09',
  closed: true,
  payableFrom: '2026-10-01T00:00:00.000Z',
  paid: null,
  tiers: TIERS,
  awards: [{ userId: 'h1', displayName: 'Ada Stage', giftCoins: 52000, bonusCoins: 3000 }],
  totalBonusCoins: 3000,
  promoBalanceCoins: '10000',
  ...over
});

function mockGets(view: any) {
  vi.mocked(adminGet).mockImplementation((path: string) =>
    Promise.resolve(path === '/admin/target-bonus/tiers' ? TIERS : view) as any
  );
}

describe('TargetBonusPage', () => {
  it('opens on the last closed month and shows who qualifies', async () => {
    mockGets(month());
    render(<TargetBonusPage />);
    expect(await screen.findByText('Ada Stage')).toBeInTheDocument();
    const monthCall = vi.mocked(adminGet).mock.calls.map((c) => c[0]).find((p) => p.startsWith('/admin/target-bonus/months/'));
    const now = new Date();
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    expect(monthCall).toBe(`/admin/target-bonus/months/${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}`);
    expect(screen.getByText('1 host(s) qualify for 3,000 bonus coins.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument(); // ladder loaded into the editor
  });

  it('pays only after confirmation and reports the result', async () => {
    mockGets(month());
    vi.mocked(adminPost).mockResolvedValue(month({ paid: { ledgerTransactionId: 'ltx1', paidAt: '2026-10-02T10:00:00.000Z' }, alreadyPaid: false }));
    render(<TargetBonusPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Pay 2026-09$/ }));
    expect(adminPost).not.toHaveBeenCalled(); // the trigger only opens the dialog
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pay 2026-09' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/target-bonus/months/2026-09/pay'));
    expect(await screen.findByText('Paid 3,000 bonus coins to 1 host(s) for 2026-09.')).toBeInTheDocument();
  });

  it('changing the month hides the old preview so a different month cannot be paid from it', async () => {
    mockGets(month());
    render(<TargetBonusPage />);
    await screen.findByRole('button', { name: /^Pay 2026-09$/ });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-08' } });
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
    expect(screen.queryByText('Ada Stage')).toBeNull();
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('a paid month offers no pay button', async () => {
    mockGets(month({ paid: { ledgerTransactionId: 'ltx1', paidAt: '2026-10-02T10:00:00.000Z' } }));
    render(<TargetBonusPage />);
    expect(await screen.findByText(/ledger ltx1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  it('an open month offers no pay button and says when it can be paid', async () => {
    mockGets(month({ closed: false }));
    render(<TargetBonusPage />);
    expect(await screen.findByText(/is still running/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  });

  it('shows the API error when paying fails (e.g. promo budget too small)', async () => {
    mockGets(month());
    vi.mocked(adminPost).mockRejectedValue(new Error('The promo budget holds 10 coins but 2026-09 needs 3000.'));
    render(<TargetBonusPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Pay 2026-09$/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Pay 2026-09' }));
    expect(await screen.findByText(/needs 3000/)).toBeInTheDocument();
  });

  it('saves the edited ladder', async () => {
    mockGets(month());
    vi.mocked(adminPost).mockResolvedValue([{ minGiftCoins: 20000, bonusCoins: 900 }]);
    render(<TargetBonusPage />);
    fireEvent.change(await screen.findByLabelText('Tier 1 target'), { target: { value: '20000' } });
    fireEvent.change(screen.getByLabelText('Tier 1 bonus'), { target: { value: '900' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save ladder' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/target-bonus/tiers', { tiers: [{ minGiftCoins: 20000, bonusCoins: 900 }] })
    );
    expect(await screen.findByText('Saved 1 tier(s).')).toBeInTheDocument();
  });
});
