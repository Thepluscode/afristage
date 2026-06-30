import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import LiveRoomsPage from '../app/live-rooms/page';

const room = (over: Record<string, unknown> = {}) => ({
  id: 'room-abcdef123456',
  title: 'My Room',
  status: 'LIVE',
  category: 'Talk',
  country: 'NG',
  language: 'EN',
  reportsCount: 0,
  peakViewers: 42,
  startedAt: '2024-06-07T08:09:10.000Z',
  host: { profile: { displayName: 'Host Name' }, creatorProfile: { stageName: 'Stage Host' } },
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('LiveRoomsPage', () => {
  it('renders the empty state', async () => {
    render(<LiveRoomsPage />);
    expect(await screen.findByText('No live rooms need operator attention.')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('rooms boom'));
    render(<LiveRoomsPage />);
    expect(await screen.findByText('rooms boom')).toBeInTheDocument();
  });

  it('renders a populated row with stage name host and all fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([room()]);
    render(<LiveRoomsPage />);
    expect(await screen.findByText('My Room')).toBeInTheDocument();
    // stageName preferred over displayName
    expect(screen.getByText('Stage Host')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Talk')).toBeInTheDocument();
    expect(screen.getByText(/NG · EN/)).toBeInTheDocument();
  });

  it('falls back to displayName and dashes for missing fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      room({
        id: 'r-fallback',
        host: { profile: { displayName: 'Only Display' }, creatorProfile: {} },
        category: undefined,
        country: undefined,
        language: undefined,
        startedAt: null,
        reportsCount: undefined
      })
    ]);
    render(<LiveRoomsPage />);
    expect(await screen.findByText('Only Display')).toBeInTheDocument();
    // category dash + started dash are standalone nodes; region is "— · —" (one node)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/—\s*·\s*—/)).toBeInTheDocument();
  });

  it('shows the reported-rooms warning and sorts reported/live first', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      room({ id: 'r-ended', title: 'Ended Room', status: 'ENDED', reportsCount: 0, startedAt: null }),
      room({ id: 'r-reported', title: 'Reported Room', status: 'LIVE', reportsCount: 5 })
    ]);
    render(<LiveRoomsPage />);
    expect(await screen.findByText('Reported live rooms are prioritised at the top of the queue.')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not show the warning when no rooms are reported', async () => {
    vi.mocked(adminGet).mockResolvedValue([room({ reportsCount: 0 })]);
    render(<LiveRoomsPage />);
    await screen.findByText('My Room');
    expect(screen.queryByText('Reported live rooms are prioritised at the top of the queue.')).not.toBeInTheDocument();
  });

  it('suspends a live room when confirmed', async () => {
    vi.mocked(adminGet).mockResolvedValue([room({ status: 'LIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LiveRoomsPage />);
    await screen.findByText('My Room');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/live-rooms/room-abcdef123456/suspend', { reason: 'admin takedown' })
    );
  });

  it('does not suspend when confirm is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([room({ status: 'LIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<LiveRoomsPage />);
    await screen.findByText('My Room');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('sorts by report count when live status is equal, with nullish fallbacks', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      // all LIVE -> first term is 0 -> tiebreak (with ?? 0 fallbacks) runs.
      // Interleave defined/undefined so the ?? fallback fires for both
      // comparator arguments regardless of V8's sort call ordering.
      room({ id: 'r-u1', title: 'Undef Reports', status: 'LIVE', reportsCount: undefined }),
      room({ id: 'r-high', title: 'High Reports', status: 'LIVE', reportsCount: 9 }),
      room({ id: 'r-u2', title: 'Undef Two', status: 'LIVE', reportsCount: undefined }),
      room({ id: 'r-mid', title: 'Mid Reports', status: 'LIVE', reportsCount: 3 })
    ]);
    render(<LiveRoomsPage />);
    const high = await screen.findByText('High Reports');
    const undef = screen.getByText('Undef Reports');
    // higher reports first; undefined (-> 0) sinks to the bottom
    expect(high.compareDocumentPosition(undef) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('ends a live room when confirmed', async () => {
    vi.mocked(adminGet).mockResolvedValue([room({ status: 'LIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<LiveRoomsPage />);
    await screen.findByText('My Room');

    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/live-rooms/room-abcdef123456/end')
    );
  });
});
