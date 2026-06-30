import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import ReportsPage from '../app/reports/page';

const report = (over: Record<string, unknown> = {}) => ({
  id: 'report-1',
  priority: 'CRITICAL',
  reason: 'Harassment',
  status: 'OPEN',
  details: 'details here',
  createdAt: '2024-07-08T09:10:11.000Z',
  reporter: { profile: { username: 'reporteruser', displayName: 'Reporter Display' } },
  targetUser: { profile: { username: 'targetuser' } },
  room: { title: 'Room Title' },
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('ReportsPage', () => {
  it('renders the empty state', async () => {
    render(<ReportsPage />);
    expect(await screen.findByText('No reports in the moderation queue.')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('reports boom'));
    render(<ReportsPage />);
    expect(await screen.findByText('reports boom')).toBeInTheDocument();
  });

  it('renders a populated row with all fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([report()]);
    render(<ReportsPage />);
    expect(await screen.findByText('Harassment')).toBeInTheDocument();
    // CRITICAL also appears as a select <option>, scope to the priority badge pill
    expect(screen.getByText('CRITICAL', { selector: 'td .pill' })).toBeInTheDocument();
    expect(screen.getByText('targetuser')).toBeInTheDocument();
    // reporter prefers displayName
    expect(screen.getByText('Reporter Display')).toBeInTheDocument();
    expect(screen.getByText('Room Title')).toBeInTheDocument();
    expect(screen.getByText('OPEN', { selector: 'td .pill' })).toBeInTheDocument();
  });

  it('renders fallbacks: priority HIGH, reporter username, then dash; missing target/room', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      report({
        id: 'r-high',
        priority: 'HIGH',
        reason: 'Spam',
        reporter: { profile: { username: 'onlyusername' } },
        targetUser: undefined,
        room: undefined
      }),
      report({
        id: 'r-low',
        priority: 'LOW',
        reason: 'Other',
        reporter: undefined,
        targetUser: { profile: {} },
        room: { title: undefined }
      })
    ]);
    render(<ReportsPage />);
    expect(await screen.findByText('HIGH', { selector: 'td .pill' })).toBeInTheDocument();
    expect(screen.getByText('LOW', { selector: 'td .pill' })).toBeInTheDocument();
    // reporter username fallback
    expect(screen.getByText('onlyusername')).toBeInTheDocument();
    // targetUser missing / empty profile -> N/A
    expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(1);
    // reporter undefined -> em dash; room undefined/title undefined -> em dash
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status, priority and reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      report({ id: 'r1', status: 'OPEN', priority: 'CRITICAL', reason: 'Harassment' }),
      report({ id: 'r2', status: 'DISMISSED', priority: 'LOW', reason: 'Spam content' })
    ]);
    render(<ReportsPage />);
    await screen.findByText('Harassment');

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'DISMISSED' } });
    expect(screen.queryByText('Harassment')).not.toBeInTheDocument();
    expect(screen.getByText('Spam content')).toBeInTheDocument();

    fireEvent.change(selects[1], { target: { value: 'LOW' } });
    expect(screen.getByText('Spam content')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Reason / target / country'), { target: { value: 'SPAM' } });
    expect(screen.getByText('Spam content')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Reason / target / country'), { target: { value: 'zzz' } });
    expect(screen.queryByText('Spam content')).not.toBeInTheDocument();
  });

  it('submits the filter form without reloading', async () => {
    vi.mocked(adminGet).mockResolvedValue([report()]);
    const { container } = render(<ReportsPage />);
    await screen.findByText('Harassment');
    fireEvent.submit(container.querySelector('form')!);
    expect(adminGet).toHaveBeenCalledTimes(1);
  });

  it('actions a report with a typed reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([report()]);
    vi.spyOn(window, 'prompt').mockReturnValue('typed reason');
    render(<ReportsPage />);
    await screen.findByText('Harassment');

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/reports/report-1/action', { action: 'REVIEWING', reason: 'typed reason' })
    );
  });

  it('actions a report falling back to the action as the reason', async () => {
    vi.mocked(adminGet).mockResolvedValue([report()]);
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<ReportsPage />);
    await screen.findByText('Harassment');

    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/reports/report-1/action', { action: 'ESCALATE', reason: 'ESCALATE' })
    );
  });

  it('fires the remaining action buttons', async () => {
    vi.mocked(adminGet).mockResolvedValue([report()]);
    vi.spyOn(window, 'prompt').mockReturnValue('r');
    render(<ReportsPage />);
    await screen.findByText('Harassment');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Actioned' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend User' }));
    fireEvent.click(screen.getByRole('button', { name: 'Suspend Room' }));

    await waitFor(() => expect(adminPost).toHaveBeenCalledTimes(4));
    const actions = vi.mocked(adminPost).mock.calls.map((c) => (c[1] as { action: string }).action);
    expect(actions).toEqual(['DISMISS', 'ACTIONED', 'SUSPEND_USER', 'SUSPEND_ROOM']);
  });
});
