import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { adminGet, adminPatch, adminPost } from '../lib/api';
import EventsPage from '../app/events/page';

afterEach(() => {
  vi.restoreAllMocks();
  nav.search = '';
});

const HOUR = 3_600_000;
const ev = (over: Partial<any> = {}) => ({
  id: 'e1',
  name: 'Afrobeats Night',
  startsAt: new Date(Date.now() - HOUR).toISOString(),
  endsAt: new Date(Date.now() + HOUR).toISOString(),
  prizePoolCoins: 1000,
  settledAt: null,
  _count: { gifts: 2 },
  ...over
});

describe('EventsPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('events-boom'));
    render(<EventsPage />);
    expect(await screen.findByText('events-boom')).toBeInTheDocument();
  });

  it('empty -> empty state', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<EventsPage />);
    expect(await screen.findByText('No events yet. Create the first limited-time campaign above.')).toBeInTheDocument();
  });

  it('renders every status: LIVE, UPCOMING, ENDED, SETTLED (with pool + no-pool)', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      ev({ id: 'live', name: 'Live Event' }),
      ev({ id: 'up', name: 'Upcoming Event', startsAt: new Date(Date.now() + HOUR).toISOString(), endsAt: new Date(Date.now() + 2 * HOUR).toISOString() }),
      ev({ id: 'ended', name: 'Ended Event', startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - HOUR).toISOString() }),
      ev({ id: 'nopool', name: 'Ended No Pool', prizePoolCoins: 0, _count: undefined, startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - HOUR).toISOString() }),
      ev({ id: 'done', name: 'Settled Event', settledAt: new Date().toISOString() })
    ]);
    render(<EventsPage />);
    expect(await screen.findByText('Live Event')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('UPCOMING')).toBeInTheDocument();
    expect(screen.getAllByText('ENDED')).toHaveLength(2);
    expect(screen.getByText('SETTLED')).toBeInTheDocument();
    expect(screen.getByText('Paid out')).toBeInTheDocument(); // settled -> no actions
    // only the ended+pooled event gets a Settle trigger
    expect(screen.getAllByRole('button', { name: 'Settle' })).toHaveLength(1);
    expect(screen.getAllByText('—')).toHaveLength(1); // no-pool cell
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=e2';
    vi.mocked(adminGet).mockResolvedValue([ev({ id: 'e1' }), ev({ id: 'e2', name: 'Second' })]);
    const { container } = render(<EventsPage />);
    await waitFor(() => expect(container.querySelector('#row-e2')).not.toBeNull());
    expect(container.querySelector('#row-e2')?.className).toContain('row-highlight');
  });

  it('create: early-return on empty fields, then posts with and without a pool', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    vi.mocked(adminPost).mockResolvedValue({});
    const { container } = render(<EventsPage />);
    await screen.findByText('No events yet. Create the first limited-time campaign above.');
    fireEvent.submit(container.querySelector('form.toolbar') as HTMLFormElement);
    expect(adminPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'New Event' } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2026-08-01T18:00' } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: '2026-08-01T22:00' } });
    fireEvent.change(screen.getByPlaceholderText('Prize pool coins'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/events', expect.objectContaining({ name: 'New Event', prizePoolCoins: 500 }))
    );

    // without a pool value the field is omitted entirely
    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'Poolless' } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2026-08-02T18:00' } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: '2026-08-02T22:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    await waitFor(() => expect(vi.mocked(adminPost).mock.calls.at(-1)![1]).not.toHaveProperty('prizePoolCoins'));
  });

  it('create failure surfaces the API error', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    vi.mocked(adminPost).mockRejectedValue(new Error('endsAt must be after startsAt'));
    render(<EventsPage />);
    await screen.findByText('No events yet. Create the first limited-time campaign above.');
    fireEvent.change(screen.getByPlaceholderText('Event name'), { target: { value: 'Bad' } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2026-08-02T18:00' } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: '2026-08-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    expect(await screen.findByText('endsAt must be after startsAt')).toBeInTheDocument();
  });

  it('edit pool: cancel does nothing, save patches', async () => {
    vi.mocked(adminGet).mockResolvedValue([ev()]);
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<EventsPage />);
    await screen.findByText('Afrobeats Night');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Pool' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(adminPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Pool' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '2500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Pool' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/events/e1', { prizePoolCoins: 2500 }));
  });

  it('settle: confirm pays winners and shows the result banner', async () => {
    const ended = ev({ startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - HOUR).toISOString() });
    vi.mocked(adminGet).mockResolvedValue([ended]);
    vi.mocked(adminPost).mockResolvedValue({
      ok: true,
      winners: [{ userId: 'u1', rank: 1, coins: 500 }, { userId: 'u2', rank: 2, coins: 300 }],
      paidCoins: 800
    });
    render(<EventsPage />);
    await screen.findByText('Afrobeats Night');
    fireEvent.click(screen.getByRole('button', { name: 'Settle' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/events/e1/settle'));
    expect(await screen.findByText(/paid 800 coins to 2 winner/)).toBeInTheDocument();
  });

  it('settle with no supporters explains the pool stays in PROMO', async () => {
    const ended = ev({ startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - HOUR).toISOString() });
    vi.mocked(adminGet).mockResolvedValue([ended]);
    vi.mocked(adminPost).mockResolvedValue({ ok: true, winners: [], paidCoins: 0 });
    render(<EventsPage />);
    await screen.findByText('Afrobeats Night');
    fireEvent.click(screen.getByRole('button', { name: 'Settle' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle' }));
    expect(await screen.findByText(/no qualifying supporters/)).toBeInTheDocument();
  });

  it('settle failure (e.g. unfunded PROMO) surfaces the guard error', async () => {
    const ended = ev({ startsAt: new Date(Date.now() - 3 * HOUR).toISOString(), endsAt: new Date(Date.now() - HOUR).toISOString() });
    vi.mocked(adminGet).mockResolvedValue([ended]);
    vi.mocked(adminPost).mockRejectedValue(new Error('Insufficient balance'));
    render(<EventsPage />);
    await screen.findByText('Afrobeats Night');
    fireEvent.click(screen.getByRole('button', { name: 'Settle' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Settle' }));
    expect(await screen.findByText('Insufficient balance')).toBeInTheDocument();
  });
});
