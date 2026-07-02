import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import LeaderboardPage from '../app/leaderboard/page';

const rows = (over: Partial<Record<string, unknown>> = {}) => [
  { rank: 1, userId: 'c1', label: 'Nova', totalCoins: 12500, ...over },
  { rank: 2, userId: 'c2', label: 'Dee', totalCoins: 400 }
];

beforeEach(() => vi.mocked(adminGet).mockResolvedValue(rows()));
afterEach(() => vi.restoreAllMocks());

describe('LeaderboardPage', () => {
  it('shows the loading state before data arrives', () => {
    vi.mocked(adminGet).mockReturnValue(new Promise(() => {})); // never resolves
    render(<LeaderboardPage />);
    expect(screen.getByText('Loading charts…')).toBeInTheDocument();
  });

  it('renders the error state when the fetch fails', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('charts-boom'));
    render(<LeaderboardPage />);
    expect(await screen.findByText('charts-boom')).toBeInTheDocument();
  });

  it('defaults to top creators / this week and renders ranked rows with formatted coins', async () => {
    render(<LeaderboardPage />);
    expect(await screen.findByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('12,500 coins')).toBeInTheDocument(); // toLocaleString
    expect(screen.getByRole('columnheader', { name: 'Creator' })).toBeInTheDocument();
    expect(adminGet).toHaveBeenCalledWith('/admin/leaderboard?type=creator&window=week');
  });

  it('shows the empty state when there is no activity', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<LeaderboardPage />);
    expect(await screen.findByText('No gifting activity in this window yet.')).toBeInTheDocument();
  });

  it('switches to top supporters (refetch + column label changes)', async () => {
    render(<LeaderboardPage />);
    await screen.findByText('Nova');
    fireEvent.click(screen.getByRole('button', { name: 'Top supporters' }));
    await waitFor(() => expect(adminGet).toHaveBeenLastCalledWith('/admin/leaderboard?type=supporter&window=week'));
    expect(await screen.findByRole('columnheader', { name: 'Supporter' })).toBeInTheDocument();
    // and back to creators
    fireEvent.click(screen.getByRole('button', { name: 'Top creators' }));
    await waitFor(() => expect(adminGet).toHaveBeenLastCalledWith('/admin/leaderboard?type=creator&window=week'));
  });

  it('switches the time window (Today and All time refetch)', async () => {
    render(<LeaderboardPage />);
    await screen.findByText('Nova');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(adminGet).toHaveBeenLastCalledWith('/admin/leaderboard?type=creator&window=day'));
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() => expect(adminGet).toHaveBeenLastCalledWith('/admin/leaderboard?type=creator&window=all'));
  });
});
