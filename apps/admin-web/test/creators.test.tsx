import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import CreatorsPage from '../app/creators/page';

const creator = (over: Record<string, unknown> = {}) => ({
  id: 'creator-1',
  userId: 'user-abcdefgh',
  stageName: 'Stage Name',
  category: 'Music',
  country: 'KE',
  approvalStatus: 'PENDING',
  kycStatus: 'VERIFIED',
  createdAt: '2024-01-02T03:04:05.000Z',
  earnings: 1234,
  totalRooms: 5,
  reportsCount: 2,
  user: { email: 'creator@example.com' },
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('CreatorsPage', () => {
  it('renders the empty state', async () => {
    render(<CreatorsPage />);
    expect(await screen.findByText('No creator applications need review.')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('load failed'));
    render(<CreatorsPage />);
    expect(await screen.findByText('load failed')).toBeInTheDocument();
  });

  it('renders a populated row with all optional fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator()]);
    render(<CreatorsPage />);
    expect(await screen.findByText('Stage Name')).toBeInTheDocument();
    expect(screen.getByText('KE')).toBeInTheDocument();
    expect(screen.getByText('Music')).toBeInTheDocument();
    // PENDING also appears as a select <option>, scope to the status badge pill
    expect(screen.getByText('PENDING', { selector: 'td .pill' })).toBeInTheDocument();
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders fallbacks for missing optional fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      creator({
        id: 'c-empty',
        stageName: '',
        user: { email: 'fallback@email.com' },
        country: '',
        category: '',
        createdAt: undefined,
        earnings: undefined,
        totalRooms: undefined,
        reportsCount: undefined
      })
    ]);
    render(<CreatorsPage />);
    // stageName empty -> user.email
    expect(await screen.findByText('fallback@email.com')).toBeInTheDocument();
    // reportsCount undefined -> 0
    expect(screen.getByText('0')).toBeInTheDocument();
    // country/category empty + createdAt/earnings/totalRooms undefined -> em dashes
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5);
  });

  it('filters by approval status', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      creator({ id: 'c-p', approvalStatus: 'PENDING', stageName: 'Pending One' }),
      creator({ id: 'c-a', approvalStatus: 'APPROVED', stageName: 'Approved One' })
    ]);
    render(<CreatorsPage />);
    await screen.findByText('Pending One');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'APPROVED' } });
    expect(screen.queryByText('Pending One')).not.toBeInTheDocument();
    expect(screen.getByText('Approved One')).toBeInTheDocument();
  });

  it('submits the filter form without reloading (preventDefault)', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator()]);
    const { container } = render(<CreatorsPage />);
    await screen.findByText('Stage Name');
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    // only the initial load occurred
    expect(adminGet).toHaveBeenCalledTimes(1);
  });

  it('approves a creator', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'PENDING' })]);
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Approve Creator' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/creators/user-abcdefgh/approve')
    );
  });

  it('rejects a creator using a typed reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'PENDING' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('bad behaviour');
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/creators/user-abcdefgh/reject', { reason: 'bad behaviour' })
    );
  });

  it('rejects a creator falling back to the default reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'PENDING' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/creators/user-abcdefgh/reject', { reason: 'Rejected by admin' })
    );
  });

  it('does not reject when confirm is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'PENDING' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('suspends a creator using a typed reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'APPROVED' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('policy breach');
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/creators/user-abcdefgh/suspend', { reason: 'policy breach' })
    );
  });

  it('suspends a creator falling back to the default reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([creator({ approvalStatus: 'APPROVED' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('');
    render(<CreatorsPage />);
    await screen.findByText('Stage Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/creators/user-abcdefgh/suspend', { reason: 'Suspended by admin' })
    );
  });
});
