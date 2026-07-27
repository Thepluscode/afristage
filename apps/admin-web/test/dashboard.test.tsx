import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
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
  rooms?: unknown | 'reject';
  reports?: unknown | 'reject';
  payouts?: unknown | 'reject';
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
    if (p === '/admin/live-rooms') {
      return opts.rooms === 'reject'
        ? Promise.reject(new Error('rooms boom'))
        : Promise.resolve(opts.rooms ?? []);
    }
    if (p === '/admin/reports') {
      return opts.reports === 'reject'
        ? Promise.reject(new Error('reports boom'))
        : Promise.resolve(opts.reports ?? []);
    }
    if (p === '/admin/payouts') {
      return opts.payouts === 'reject'
        ? Promise.reject(new Error('payouts boom'))
        : Promise.resolve(opts.payouts ?? []);
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

/** The dialog trigger and its confirm button share a label, so confirmations are
 *  always clicked inside the modal's action row. */
const modalActions = () => document.querySelector('.modal-actions') as HTMLElement;

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

    expect(await screen.findByText('Mission Control')).toBeInTheDocument();
    // metric cards present
    expect(screen.getByText('Rooms opened today')).toBeInTheDocument();
    expect(screen.getByText('Creators joined today')).toBeInTheDocument();
    // the live-now count rides along as the caption, not as a "vs yesterday" rate
    expect(screen.getByText('5 live now')).toBeInTheDocument();
    // "Critical reports" appears in both the metric card and the queue table
    expect(screen.getAllByText('Critical reports').length).toBeGreaterThan(0);
    expect(screen.getByText('Open support')).toBeInTheDocument();
    // series rejected -> today's flow is 0; the all-time gross is the caption
    expect(screen.getByText('0 COIN')).toBeInTheDocument();
    expect(screen.getByText('100 all time')).toBeInTheDocument();

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
    // live-rooms tab renders its empty state once the (empty) fetch resolves
    expect(await screen.findByText('No live rooms yet.')).toBeInTheDocument();
    expect(screen.getByText('Creators joined today')).toBeInTheDocument();
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

  it('renders the live-rooms table, ordering live and reported rooms first', async () => {
    const now = Date.now();
    const at = (msAgo: number) => new Date(now - msAgo).toISOString();
    wire({
      dash: baseDash,
      rooms: [
        // ENDED, quiet — must sort last
        { id: 'r-ended', title: 'Old Session', status: 'ENDED', category: 'Talk', peakViewers: 5, reportsCount: 0, startedAt: at(5 * 864e5) },
        // LIVE + reported — must sort first
        {
          id: 'r-hot',
          title: 'Friday Afrobeats',
          status: 'LIVE',
          category: 'Music',
          peakViewers: 1240,
          reportsCount: 3,
          startedAt: at(90 * 1000),
          host: { creatorProfile: { stageName: 'DJ Xtreme' } }
        },
        // LIVE, no reports, fewer viewers
        {
          id: 'r-quiet',
          title: 'Acoustic Soul',
          status: 'LIVE',
          category: 'Soul',
          peakViewers: 850,
          reportsCount: 0,
          startedAt: at(3 * 36e5),
          host: { profile: { displayName: 'Layo' } }
        },
        // no category / no host / no startedAt -> em-dash fallbacks
        { id: 'r-bare', title: '', status: 'LIVE', category: '', peakViewers: 0, startedAt: null },
        // malformed record with no id is dropped rather than half-rendered
        { title: 'Ghost', status: 'LIVE', category: 'Music', peakViewers: 1 }
      ]
    });
    render(<DashboardPage />);

    expect(await screen.findByText('Friday Afrobeats')).toBeInTheDocument();
    expect(screen.queryByText('Ghost')).not.toBeInTheDocument();
    // untitled room falls back rather than rendering an empty cell
    expect(screen.getByText('Untitled room')).toBeInTheDocument();

    const order = [...document.querySelectorAll('.ops-table tbody tr td:first-child strong')].map(
      (n) => n.textContent
    );
    expect(order[0]).toBe('Friday Afrobeats');
    expect(order[order.length - 1]).toBe('Old Session');

    // host name resolves from either creatorProfile or profile
    expect(screen.getByText('DJ Xtreme')).toBeInTheDocument();
    expect(screen.getByText('Layo')).toBeInTheDocument();

    // relativeTime buckets: minutes, hours, days, and the null fallback
    expect(screen.getByText('1m ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
    expect(screen.getByText('5d ago')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);

    // only the reported room gets a pill; the rest stay quiet
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(document.querySelectorAll('.ops-table .pill.warning')).toHaveLength(1);
  });

  it('says "loading" while the live-rooms fetch is still in flight', async () => {
    wire({ dash: baseDash });
    // rooms alone never settles
    vi.mocked(adminGet).mockImplementation(((p: string) =>
      p === '/admin/live-rooms'
        ? new Promise(() => {})
        : p === '/admin/dashboard'
          ? Promise.resolve(baseDash)
          : Promise.resolve([])) as never);
    render(<DashboardPage />);
    expect(await screen.findByText('Loading live rooms…')).toBeInTheDocument();
  });

  it('formats a just-now room and tolerates an unparseable timestamp', async () => {
    wire({
      dash: baseDash,
      rooms: [
        { id: 'a', title: 'Just Started', status: 'LIVE', category: 'Music', peakViewers: 1, startedAt: new Date().toISOString() },
        { id: 'b', title: 'Bad Clock', status: 'LIVE', category: 'Music', peakViewers: 1, startedAt: 'not-a-date' }
      ]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('just now')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('keeps the dashboard usable when the live-rooms fetch fails', async () => {
    wire({ dash: baseDash, rooms: 'reject' });
    render(<DashboardPage />);
    expect(await screen.findByRole('tab', { name: 'Live Rooms' })).toBeInTheDocument();
    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith('Optional live-rooms table failed to load', expect.any(Error));
    });
    // the failure is stated plainly — never a permanent spinner or a false "no rooms"
    expect(
      await screen.findByText('Could not load live rooms — open the live rooms page to retry.')
    ).toBeInTheDocument();
  });

  it('shows a day-over-day trend when the prior day is non-zero and hides it otherwise', async () => {
    wire({
      dash: { ...baseDash, grossGiftVolumeCoins: 200, newUsersToday: 8 },
      // gift volume rises 10 -> 20 (+100%); new users have a zero prior day (no percentage exists)
      series: [
        { day: 'd1', newUsers: 0, giftCount: 1, giftVolumeCoins: 10 },
        { day: 'd2', newUsers: 8, giftCount: 2, giftVolumeCoins: 20 }
      ]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('▲ +100.0%')).toBeInTheDocument();
    // exactly one trend label — the new-users card must not invent one
    expect(document.querySelectorAll('.metric-card em')).toHaveLength(1);
  });

  it('trends the flow metrics and leaves the backlog counters undecorated', async () => {
    wire({
      dash: { ...baseDash, activeRooms: 4, criticalReports: 2, pendingPayouts: 3, openSupportTickets: 5 },
      series: [
        { day: 'd1', newUsers: 2, giftCount: 1, giftVolumeCoins: 10, newRooms: 4, newCreators: 2 },
        { day: 'd2', newUsers: 4, giftCount: 2, giftVolumeCoins: 20, newRooms: 5, newCreators: 3 }
      ]
    });
    render(<DashboardPage />);
    await screen.findByText('Rooms opened today');

    // exactly the four flow cards carry a delta: rooms, creators, gift volume, users
    expect(document.querySelectorAll('.metric-card em')).toHaveLength(4);
    // backlog counters must not imply a rate
    for (const label of ['Critical reports', 'Pending payouts', 'Open support', 'Failed payments']) {
      const card = [...document.querySelectorAll('.metric-card')].find((c) =>
        c.querySelector('.metric-card-head')?.textContent?.includes(label)
      );
      expect(card?.querySelector('em')).toBeNull();
    }
    // the new flow series also appear in the growth panel
    expect(screen.getByText('Rooms opened / day')).toBeInTheDocument();
    expect(screen.getByText('Creators joined / day')).toBeInTheDocument();
  });

  it('tolerates a series predating the newRooms/newCreators fields', async () => {
    // an older API build omits them; the cards must read 0, not NaN
    wire({
      dash: baseDash,
      series: [
        { day: 'd1', newUsers: 1, giftCount: 0, giftVolumeCoins: 0 },
        { day: 'd2', newUsers: 2, giftCount: 0, giftVolumeCoins: 0 }
      ]
    });
    render(<DashboardPage />);
    const card = await screen.findByText('Rooms opened today');
    expect(card.closest('.metric-card')?.querySelector('strong')?.textContent).toBe('0');
  });

  it('renders a falling trend with the down arrow', async () => {
    wire({
      dash: { ...baseDash, grossGiftVolumeCoins: 5 },
      series: [
        { day: 'd1', newUsers: 1, giftCount: 1, giftVolumeCoins: 40 },
        { day: 'd2', newUsers: 1, giftCount: 1, giftVolumeCoins: 30 }
      ]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('▼ -25.0%')).toBeInTheDocument();
  });

  it('shows per-room gift revenue and the report count from the API', async () => {
    wire({
      dash: baseDash,
      rooms: [
        { id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 12, giftCoins: 285600, reportsCount: 3 },
        // absent giftCoins/reportsCount must read as zero, not blank or NaN
        { id: 'r2', title: 'Quiet', status: 'LIVE', category: 'Talk', peakViewers: 3 }
      ]
    });
    render(<DashboardPage />);

    expect(await screen.findByText('285,600')).toBeInTheDocument();
    // the report count is the pill, not the viewer/revenue digits elsewhere in the row
    const rows = document.querySelectorAll('.ops-table tbody tr');
    expect(rows[0].querySelector('.pill.warning')?.textContent).toBe('3');
    // r2 has neither field set: both must read 0, not blank or NaN
    expect(rows[1].querySelector('.revenue-cell')?.textContent?.trim()).toBe('0');
    expect(rows[1].querySelector('.pill.warning')).toBeNull();
  });

  it('switches queues by tab and resets the status filter across them', async () => {
    wire({
      dash: baseDash,
      rooms: [{ id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 1 }],
      reports: [
        { id: 'rep1', priority: 'CRITICAL', reason: 'Harassment', status: 'OPEN', createdAt: new Date().toISOString(), room: { title: 'Friday' } }
      ],
      payouts: [
        { id: 'p1', coinAmount: 25000, status: 'HELD', createdAt: new Date().toISOString(), creatorUserId: 'u1', creator: { creatorProfile: { stageName: 'queen_tunez' } } }
      ]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Friday')).toBeInTheDocument();

    // narrow rooms by status, then move tabs — the stale value must not carry
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'LIVE' } });
    expect(screen.getByText('Friday')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('');
    expect(screen.getByText('Harassment')).toBeInTheDocument();
    expect(screen.queryByText('Category')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Payouts' }));
    expect(screen.getByText('queen_tunez')).toBeInTheDocument();
    expect(screen.getByText('25,000')).toBeInTheDocument();

    // "Open all" follows the active tab
    expect(screen.getByRole('link', { name: /Open all/ })).toHaveAttribute('href', '/payouts');
  });

  it('filters rooms by category and says so when nothing matches', async () => {
    wire({
      dash: baseDash,
      rooms: [
        { id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 1 },
        { id: 'r2', title: 'Chat Hour', status: 'ENDED', category: 'Talk', peakViewers: 2 }
      ]
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Friday')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Talk' } });
    expect(screen.queryByText('Friday')).not.toBeInTheDocument();
    expect(screen.getByText('Chat Hour')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 1 of 1 rooms')).toBeInTheDocument();

    // a filter combination with no rows is distinct from "no data"
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'LIVE' } });
    expect(screen.getByText('No rows match these filters.')).toBeInTheDocument();
  });

  it('exports every filtered row across pages', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `r${i}`,
      title: `Room ${i}`,
      status: 'LIVE',
      category: 'Music',
      peakViewers: i,
      giftCoins: i * 10,
      host: { creatorProfile: { stageName: `Host ${i}` } }
    }));
    wire({ dash: baseDash, rooms: many });

    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // jsdom's Blob has no .text(), so capture the serialised payload directly
    const written: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          written.push(parts.join(''));
          super(parts, options);
        }
      }
    );

    render(<DashboardPage />);
    // 9 rows at a page size of 10 all fit on page one
    expect(await screen.findByText('Showing 1 to 9 of 9 rooms')).toBeInTheDocument();
    expect(screen.getByText('Room 8')).toBeInTheDocument();
    expect(screen.getByText('Room 0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const csv = written[0];
    // all nine rows plus the header, not just the six rendered
    expect(csv.split('\r\n')).toHaveLength(10);
    expect(csv).toContain('Room 0');
    // the object URL is released rather than leaked
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it('exports the reports and payouts queues, falling back on missing names', async () => {
    wire({
      dash: baseDash,
      reports: [
        // no room title -> falls back to the reported username; no reporter profile
        { id: 'rep1', priority: 'HIGH', reason: 'Spam', status: 'OPEN', createdAt: '2026-07-01T00:00:00.000Z', targetUser: { profile: { username: 'fresh_99' } } },
        // neither -> "Unknown target", and the CSV cell is empty rather than "undefined"
        { id: 'rep2', priority: 'LOW', reason: 'Other', status: 'DISMISSED', createdAt: '2026-07-01T00:00:00.000Z' },
        // room title wins over the reported user; reporter has only a username
        {
          id: 'rep3',
          priority: 'CRITICAL',
          reason: 'Nudity',
          status: 'REVIEWING',
          createdAt: '2026-07-01T00:00:00.000Z',
          room: { title: 'Friday Night' },
          reporter: { profile: { username: 'watcher_1' } }
        }
      ],
      payouts: [
        // no stage name, no display name -> falls back to the raw user id
        { id: 'p1', coinAmount: 500, status: 'HELD', createdAt: '2026-07-01T00:00:00.000Z', creatorUserId: 'user-xyz' },
        { id: 'p2', coinAmount: 900, status: 'PAID', createdAt: '2026-07-01T00:00:00.000Z', creatorUserId: 'user-abc', creator: { profile: { displayName: 'Layo' } } },
        // stage name wins over both
        { id: 'p3', coinAmount: 100, status: 'PAID', createdAt: '2026-07-01T00:00:00.000Z', creatorUserId: 'user-def', creator: { creatorProfile: { stageName: 'DJ Xtreme' }, profile: { displayName: 'ignored' } } }
      ]
    });

    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const written: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          written.push(parts.join(''));
          super(parts, options);
        }
      }
    );

    render(<DashboardPage />);
    await screen.findByRole('tab', { name: 'Reports' });

    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByText('Unknown target')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(written[0]).toContain('Reported,Reason,Priority,Status,Created');
    expect(written[0]).toContain('fresh_99,Spam,HIGH,OPEN');
    expect(written[0]).toContain('\r\n,Other,LOW,DISMISSED');
    expect(written[0]).toContain('Friday Night,Nudity,CRITICAL,REVIEWING');
    // reporter with only a username still labels the row
    expect(screen.getByText('watcher_1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Payouts' }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(written[1]).toContain('Creator,Coins,Status,Created');
    expect(written[1]).toContain('user-xyz,500,HELD');
    expect(written[1]).toContain('Layo,900,PAID');
    expect(written[1]).toContain('DJ Xtreme,100,PAID');

    vi.unstubAllGlobals();
  });

  it('falls back to the plain room title and blank creator in the rooms export', async () => {
    wire({
      dash: baseDash,
      rooms: [
        // no host at all, and no giftCoins/reportsCount/startedAt
        { id: 'r1', title: 'Bare, Room', status: 'LIVE', category: 'Music', peakViewers: 1 },
        // host with only a display name -> the middle fallback
        { id: 'r2', title: 'Named Host', status: 'LIVE', category: 'Talk', peakViewers: 2, host: { profile: { displayName: 'Amaka Gold' } } }
      ]
    });
    const createObjectURL = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const written: string[] = [];
    const RealBlob = globalThis.Blob;
    vi.stubGlobal(
      'Blob',
      class extends RealBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          written.push(parts.join(''));
          super(parts, options);
        }
      }
    );

    render(<DashboardPage />);
    await screen.findByText('Bare, Room');
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    // the comma in the title is quoted so the columns do not shift
    expect(written[0]).toContain('"Bare, Room",,Music,LIVE,1,0,0,');
    expect(written[0]).toContain('Named Host,Amaka Gold,Talk,LIVE,2,0,0,');

    vi.unstubAllGlobals();
  });

  it('pages the rooms queue and resets to page one when a filter changes', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      id: `r${i}`,
      title: `Room ${String(i).padStart(2, '0')}`,
      status: i < 5 ? 'ENDED' : 'LIVE',
      category: i % 2 === 0 ? 'Music' : 'Talk',
      peakViewers: 100 - i
    }));
    wire({ dash: baseDash, rooms: many });
    render(<DashboardPage />);

    expect(await screen.findByText('Showing 1 to 10 of 23 rooms')).toBeInTheDocument();
    expect(document.querySelectorAll('.ops-table tbody tr')).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(screen.getByText('Showing 21 to 23 of 23 rooms')).toBeInTheDocument();
    expect(document.querySelectorAll('.ops-table tbody tr')).toHaveLength(3);

    // filtering while deep in the pages must not strand the operator on an
    // empty page — it returns to page one
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Talk' } });
    expect(screen.getByText(/^Showing 1 to 10 of 11 rooms$/)).toBeInTheDocument();
  });

  it('clamps the page when the row count shrinks beneath it', async () => {
    wire({
      dash: baseDash,
      rooms: Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`,
        title: `Room ${i}`,
        status: i === 0 ? 'ENDED' : 'LIVE',
        category: 'Music',
        peakViewers: 12 - i
      }))
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Showing 1 to 10 of 12 rooms')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('Showing 11 to 12 of 12 rooms')).toBeInTheDocument();

    // narrowing to a single row collapses to one page rather than rendering blank
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ENDED' } });
    expect(screen.getByText('Showing 1 to 1 of 1 rooms')).toBeInTheDocument();
    expect(screen.getByText('Room 0')).toBeInTheDocument();
  });

  it('suspends and ends a room from the row, then refreshes the queue', async () => {
    wire({
      dash: baseDash,
      rooms: [{ id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 5 }]
    });
    vi.mocked(adminPost).mockResolvedValue({} as never);
    render(<DashboardPage />);
    await screen.findByText('Friday');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/live-rooms/r1/suspend', { reason: 'admin takedown' })
    );
    // the queue is re-fetched so the row reflects the new status
    await waitFor(() => expect(vi.mocked(adminGet).mock.calls.filter((c) => c[0] === '/admin/live-rooms').length).toBeGreaterThan(1));
  });

  it('disables the row action that cannot apply to the row', async () => {
    wire({
      dash: baseDash,
      rooms: [
        { id: 'r1', title: 'Already Suspended', status: 'SUSPENDED', category: 'Music', peakViewers: 1 }
      ]
    });
    render(<DashboardPage />);
    await screen.findByText('Already Suspended');
    // cannot suspend twice, and cannot end a room that is not live
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'End' })).toBeDisabled();
  });

  it('surfaces a failed row action instead of silently doing nothing', async () => {
    wire({
      dash: baseDash,
      rooms: [{ id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 5 }]
    });
    vi.mocked(adminPost).mockRejectedValue(new Error('room already ended'));
    render(<DashboardPage />);
    await screen.findByText('Friday');

    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'End' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('End failed: room already ended');
  });

  it('escalates a report from the row', async () => {
    wire({
      dash: baseDash,
      reports: [
        { id: 'rep1', priority: 'HIGH', reason: 'Spam', status: 'OPEN', createdAt: new Date().toISOString(), room: { title: 'Friday' } }
      ]
    });
    vi.mocked(adminPost).mockResolvedValue({} as never);
    render(<DashboardPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Reports' }));

    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'repeat offender' } });
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'Escalate' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/reports/rep1/action', { action: 'ESCALATE', reason: 'repeat offender' })
    );

    // an escalation with no reason still records the action name
    vi.mocked(adminPost).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'Escalate' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/reports/rep1/action', { action: 'ESCALATE', reason: 'ESCALATE' })
    );
  });

  it('reviews a report and falls back to the action name when no reason is given', async () => {
    wire({
      dash: baseDash,
      reports: [
        { id: 'rep1', priority: 'HIGH', reason: 'Spam', status: 'OPEN', createdAt: new Date().toISOString(), room: { title: 'Friday' } }
      ]
    });
    vi.mocked(adminPost).mockResolvedValue({} as never);
    render(<DashboardPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Reports' }));

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    // submitted with the reason left blank
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/reports/rep1/action', { action: 'REVIEWING', reason: 'REVIEWING' })
    );
  });

  it('describes a non-Error rejection rather than rendering "[object Object]"', async () => {
    wire({
      dash: baseDash,
      rooms: [{ id: 'r1', title: 'Friday', status: 'LIVE', category: 'Music', peakViewers: 5 }]
    });
    // some transports reject with a plain value, not an Error
    vi.mocked(adminPost).mockRejectedValue('gateway timeout');
    render(<DashboardPage />);
    await screen.findByText('Friday');

    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    fireEvent.click(within(modalActions()).getByRole('button', { name: 'End' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('End failed: unknown error');
  });

  it('links payouts to their own page rather than moving money from the preview', async () => {
    wire({
      dash: baseDash,
      payouts: [{ id: 'p1', coinAmount: 500, status: 'HELD', createdAt: new Date().toISOString(), creatorUserId: 'u1' }]
    });
    render(<DashboardPage />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Payouts' }));
    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/payouts?id=p1');
    // no approve/reject control exists on this surface
    expect(screen.queryByRole('button', { name: /Approve|Reject/ })).not.toBeInTheDocument();
  });

  it('warns when the fetch hit the API row cap so the total is not read as complete', async () => {
    wire({
      dash: baseDash,
      rooms: Array.from({ length: 100 }, (_, i) => ({
        id: `r${i}`,
        title: `Room ${i}`,
        status: 'LIVE',
        category: 'Music',
        peakViewers: 1
      }))
    });
    render(<DashboardPage />);
    expect(await screen.findByText(/most recent 100 records/)).toBeInTheDocument();
  });

  it('disables Export when there is nothing to export', async () => {
    wire({ dash: baseDash, rooms: [] });
    render(<DashboardPage />);
    expect(await screen.findByText('No rows')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled();
  });

  it('reports a failed tab fetch without blocking the others', async () => {
    wire({ dash: baseDash, reports: 'reject', payouts: 'reject' });
    render(<DashboardPage />);
    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith('Optional reports tab failed to load', expect.any(Error));
      expect(console.warn).toHaveBeenCalledWith('Optional payouts tab failed to load', expect.any(Error));
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Reports' }));
    expect(screen.getByText('Could not load reports — open the reports page to retry.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Payouts' }));
    expect(screen.getByText('Could not load payouts — open the payouts page to retry.')).toBeInTheDocument();
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
