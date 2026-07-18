import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import UserActivityPage from '../app/user-activity/page';

afterEach(() => vi.clearAllMocks());

const resp = {
  windowDays: 7,
  generatedAt: '2026-07-17T00:00:00.000Z',
  users: [
    { id: 'q', displayName: 'Quiet Q', email: 'q@x.co', role: 'VIEWER', status: 'ACTIVE', createdAt: '2026-06-01', lastActiveAt: '2026-07-11', daysSinceActive: 6, weekActions: 0, weekBreakdown: { rooms: 0, gifts: 0, missions: 0 } },
    { id: 'a', displayName: 'Active A', email: 'a@x.co', role: 'VIEWER', status: 'ACTIVE', createdAt: '2026-06-01', lastActiveAt: '2026-07-17', daysSinceActive: 0, weekActions: 6, weekBreakdown: { rooms: 2, gifts: 3, missions: 1 } },
    { id: 'y', displayName: 'Yesterday Y', email: null, role: 'VIEWER', status: 'ACTIVE', createdAt: '2026-06-01', lastActiveAt: '2026-07-16', daysSinceActive: 1, weekActions: 1, weekBreakdown: { rooms: 1, gifts: 0, missions: 0 } },
    { id: 'n', displayName: 'New N', email: null, role: 'VIEWER', status: 'ACTIVE', createdAt: '2026-07-16', lastActiveAt: null, daysSinceActive: null, weekActions: 0, weekBreakdown: { rooms: 0, gifts: 0, missions: 0 } }
  ]
};

describe('UserActivityPage', () => {
  it('renders each user with last-active label and signal badge', async () => {
    vi.mocked(adminGet).mockResolvedValue(resp as any);
    render(<UserActivityPage />);
    expect(await screen.findByText('Quiet Q')).toBeInTheDocument();
    // last-active labels: '6d ago', 'Today', 'Yesterday', 'Never active'
    expect(screen.getByText('6d ago')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
    expect(screen.getByText('Never active')).toBeInTheDocument();
    // signals: QUIET (6d >= 3), ACTIVE (today/yesterday), NEW (never active)
    expect(screen.getByText('QUIET')).toBeInTheDocument();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('NEW')).toBeInTheDocument();
  });

  it('shows an error state when the fetch rejects', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('activity-boom'));
    render(<UserActivityPage />);
    expect(await screen.findByText('activity-boom')).toBeInTheDocument();
  });

  it('renders the empty state when there are no users', async () => {
    vi.mocked(adminGet).mockResolvedValue({ windowDays: 7, generatedAt: 'x', users: [] } as any);
    render(<UserActivityPage />);
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });
});
