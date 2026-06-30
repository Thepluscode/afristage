import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet, adminPost } from '../lib/api';
import PayoutsPage from '../app/payouts/page';

afterEach(() => vi.restoreAllMocks());

const payout = (over: Partial<any> = {}) => ({
  id: 'p1',
  coinAmount: 1000,
  fiatMinor: 50000,
  fiatCurrency: 'USD',
  status: 'UNDER_REVIEW',
  creatorUserId: 'creator-aaaaaaaa1111',
  createdAt: '2024-01-01T00:00:00Z',
  payoutProvider: 'PAYSTACK',
  payoutDestinationLabel: 'Main bank',
  payoutDestinationReference: '1234567890',
  payoutCountry: 'NG',
  providerReference: null,
  creator: { creatorProfile: { stageName: 'Nova' } },
  ...over
});

/** integrity ok=true by default; provide per-test risk responses keyed by creator id */
function setup({
  payouts,
  integrity = { ok: true, unbalancedTransactions: 0 },
  integrityReject = false,
  risk = {}
}: {
  payouts: any[];
  integrity?: { ok: boolean; unbalancedTransactions: number } | null;
  integrityReject?: boolean;
  risk?: Record<string, unknown | Error>;
}) {
  vi.mocked(adminGet).mockImplementation((path: string) => {
    if (path === '/admin/payouts') return Promise.resolve(payouts) as any;
    if (path === '/admin/ledger/integrity') {
      return integrityReject ? Promise.reject(new Error('integ')) : (Promise.resolve(integrity) as any);
    }
    const m = path.match(/\/admin\/fraud\/creators\/(.+)$/);
    if (m) {
      const r = risk[m[1]];
      if (r instanceof Error) return Promise.reject(r);
      if (r === undefined) return Promise.reject(new Error('no-risk'));
      return Promise.resolve(r) as any;
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

describe('PayoutsPage', () => {
  it('renders error state when payouts load rejects', async () => {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path === '/admin/payouts' ? Promise.reject(new Error('payouts-boom')) : Promise.resolve({ ok: true, unbalancedTransactions: 0 }) as any
    );
    render(<PayoutsPage />);
    expect(await screen.findByText('payouts-boom')).toBeInTheDocument();
  });

  it('empty payouts -> empty state, integrity ok (no banner)', async () => {
    setup({ payouts: [] });
    render(<PayoutsPage />);
    expect(await screen.findByText('No payout requests yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Ledger imbalance detected/)).not.toBeInTheDocument();
    expect(screen.getByText(/Approvals require confirmation/)).toBeInTheDocument(); // PayoutActionPanel not blocked
  });

  it('integrity fetch rejection is swallowed (no banner, treated as not blocked)', async () => {
    setup({ payouts: [], integrityReject: true });
    render(<PayoutsPage />);
    await screen.findByText('No payout requests yet.');
    expect(screen.queryByText(/Ledger imbalance detected/)).not.toBeInTheDocument();
  });

  it('renders UNDER_REVIEW row with risk present (NORMAL not shown), destination + masked ref', async () => {
    setup({
      payouts: [payout({ status: 'UNDER_REVIEW', creatorUserId: 'creator-aaaaaaaa1111' })],
      risk: { 'creator-aaaaaaaa1111': { riskScore: 0.42, recommendedAction: 'MANUAL_REVIEW' } }
    });
    render(<PayoutsPage />);
    expect(await screen.findByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('Main bank')).toBeInTheDocument();
    expect(screen.getByText(/•••• 7890/)).toBeInTheDocument(); // maskRef long
    expect(screen.getByText('0.42')).toBeInTheDocument();
    expect(screen.getByText('MANUAL_REVIEW')).toBeInTheDocument();
  });

  it('risk fetch per-creator rejects -> caught, falls to NORMAL badge', async () => {
    setup({
      payouts: [payout({ status: 'HELD', creatorUserId: 'creator-aaaaaaaa1111' })],
      risk: { 'creator-aaaaaaaa1111': new Error('risk-down') }
    });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
  });

  it('non-reviewable status (PAID) shows NORMAL and PAID ref pill; no risk fetched', async () => {
    setup({
      payouts: [payout({ status: 'PAID', providerReference: 'TRX-999', creatorUserId: 'c-paid' })]
    });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.getByText('ref TRX-999')).toBeInTheDocument();
    expect(screen.getByText('NORMAL')).toBeInTheDocument();
  });

  it('PAID without providerReference -> no ref pill', async () => {
    setup({ payouts: [payout({ status: 'PAID', providerReference: null, creatorUserId: 'c-paid2' })] });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.queryByText(/^ref /)).not.toBeInTheDocument();
  });

  it('ledger blocked: banner shown, LEDGER BLOCK badge, approve disabled, PayoutActionPanel blocked', async () => {
    setup({
      payouts: [payout({ status: 'UNDER_REVIEW', creatorUserId: 'c-block' })],
      integrity: { ok: false, unbalancedTransactions: 3 }
    });
    render(<PayoutsPage />);
    expect(await screen.findByText(/Ledger imbalance detected\. Do not approve/)).toBeInTheDocument();
    expect(screen.getByText('LEDGER BLOCK')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve Payout' })).toBeDisabled();
    expect(screen.getByText(/Approvals should remain blocked/)).toBeInTheDocument();
  });

  it('destination absent -> "No destination" pill', async () => {
    setup({ payouts: [payout({ payoutProvider: null, status: 'PAID', creatorUserId: 'c-nd' })] });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.getByText('No destination')).toBeInTheDocument();
  });

  it('destination label fallback to provider, no country', async () => {
    setup({
      payouts: [payout({ payoutDestinationLabel: null, payoutCountry: null, payoutDestinationReference: 'ab', status: 'PAID', creatorUserId: 'c-fb' })]
    });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    // label falls back to provider name (appears twice: div + pill)
    expect(screen.getAllByText(/PAYSTACK/).length).toBeGreaterThan(0);
    // maskRef short (<=4) returns ref as-is 'ab'
    expect(screen.getByText(/PAYSTACK ab/)).toBeInTheDocument();
  });

  it('HELD status shows Release Hold; clicking it calls release then reloads', async () => {
    setup({ payouts: [payout({ status: 'HELD', creatorUserId: 'c-held' })], risk: { 'c-held': { riskScore: 0.1, recommendedAction: 'NONE' } } });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    fireEvent.click(screen.getByRole('button', { name: 'Release Hold' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/release', undefined));
  });

  it('Hold Payout submits a typed reason and falls back to a default reason when empty', async () => {
    setup({ payouts: [payout({ status: 'UNDER_REVIEW', creatorUserId: 'c-h' })], risk: { 'c-h': { riskScore: 0.1, recommendedAction: 'NONE' } } });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<PayoutsPage />);
    await screen.findByText('Nova');

    // typed reason
    fireEvent.click(screen.getByRole('button', { name: 'Hold Payout' })); // trigger
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'shady activity' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold Payout' })); // confirm
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/hold', { reason: 'shady activity' }));

    // empty reason -> default fallback (not required, so confirm is enabled)
    fireEvent.click(screen.getByRole('button', { name: 'Hold Payout' }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold Payout' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/hold', { reason: 'admin hold' }));
  });

  it('Approve Payout: cancel does not approve, confirm approves', async () => {
    setup({ payouts: [payout({ status: 'UNDER_REVIEW', creatorUserId: 'c-ap' })], risk: { 'c-ap': { riskScore: 0.1, recommendedAction: 'NONE' } } });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<PayoutsPage />);
    await screen.findByText('Nova');

    // cancel path does not approve
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payout' })); // trigger
    let dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(adminPost).not.toHaveBeenCalled();

    // confirm path approves
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payout' })); // trigger
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' })); // confirm
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/approve', undefined));
  });

  it('Reject Payout submits a typed reason and falls back to a default reason when empty', async () => {
    setup({ payouts: [payout({ status: 'UNDER_REVIEW', creatorUserId: 'c-rj' })], risk: { 'c-rj': { riskScore: 0.1, recommendedAction: 'NONE' } } });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<PayoutsPage />);
    await screen.findByText('Nova');

    // typed reason
    fireEvent.click(screen.getByRole('button', { name: 'Reject Payout' })); // trigger
    let dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'fraud' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject Payout' })); // confirm
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/reject', { reason: 'fraud' }));

    // empty reason -> default fallback
    fireEvent.click(screen.getByRole('button', { name: 'Reject Payout' }));
    dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject Payout' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/reject', { reason: 'Rejected by admin' }));
  });

  it('Mark Paid (APPROVED): confirm disabled until a reference is typed, then submits', async () => {
    setup({ payouts: [payout({ status: 'APPROVED', creatorUserId: 'c-mp' })] });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<PayoutsPage />);
    await screen.findByText('Nova');

    expect(screen.getByRole('button', { name: 'Mark Paid' })).not.toBeDisabled(); // trigger enabled
    fireEvent.click(screen.getByRole('button', { name: 'Mark Paid' })); // open dialog
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Mark Paid' });
    // required -> confirm disabled while empty
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'TRX-1' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/payouts/p1/mark-paid', { reference: 'TRX-1' }));
  });

  it('Mark Paid disabled when status not APPROVED', async () => {
    setup({ payouts: [payout({ status: 'PAID', creatorUserId: 'c-mp3' })] });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeDisabled();
  });

  it('Hold button disabled when status is not UNDER_REVIEW (HELD row)', async () => {
    setup({ payouts: [payout({ status: 'HELD', creatorUserId: 'c-disabled' })], risk: { 'c-disabled': { riskScore: 0.1, recommendedAction: 'NONE' } } });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    expect(screen.getByRole('button', { name: 'Hold Payout' })).toBeDisabled();
  });

  it('provider present but destination reference null -> maskRef returns empty', async () => {
    setup({
      payouts: [payout({ payoutDestinationReference: null, payoutDestinationLabel: 'Wallet', payoutCountry: null, status: 'PAID', creatorUserId: 'c-noref' })]
    });
    render(<PayoutsPage />);
    await screen.findByText('Nova');
    // label shown, and the pill renders provider with an empty masked ref (no bullets)
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });

  it('creator name fallbacks: displayName then email', async () => {
    setup({
      payouts: [
        payout({ id: 'pa', status: 'PAID', creatorUserId: 'c-dn', creator: { profile: { displayName: 'Disp Name' } } }),
        payout({ id: 'pb', status: 'PAID', creatorUserId: 'c-em', creator: { email: 'em@x.com' } })
      ]
    });
    render(<PayoutsPage />);
    expect(await screen.findByText('Disp Name')).toBeInTheDocument();
    expect(screen.getByText('em@x.com')).toBeInTheDocument();
  });
});
