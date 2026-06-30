import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import UsersPage from '../app/users/page';

const user = (over: Record<string, unknown> = {}) => ({
  id: 'user-1234567890',
  email: 'a@example.com',
  role: 'VIEWER',
  status: 'ACTIVE',
  profile: { displayName: 'Display Name', username: 'uname' },
  country: 'NG',
  creatorProfile: { approvalStatus: 'APPROVED' },
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('UsersPage', () => {
  it('renders the empty state when no users match', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<UsersPage />);
    expect(await screen.findByText('No users match this search.')).toBeInTheDocument();
  });

  it('renders the error state when load fails', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('boom'));
    render(<UsersPage />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('renders a populated row with all fields present', async () => {
    vi.mocked(adminGet).mockResolvedValue([user()]);
    render(<UsersPage />);
    expect(await screen.findByText('Display Name')).toBeInTheDocument();
    expect(screen.getByText('NG')).toBeInTheDocument();
    // role pill (VIEWER also appears as a <option>, so scope to the pill)
    expect(document.querySelector('.pill.creator')).toHaveTextContent('VIEWER');
    // creatorProfile.approvalStatus rendered as a StatusBadge
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('falls back through name candidates and null fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      // no displayName -> username
      user({ id: 'u-a', profile: { username: 'justuname' }, country: null, creatorProfile: null }),
      // no displayName/username -> email
      user({ id: 'u-b', profile: {}, email: 'only@email.com', country: null, creatorProfile: {} })
    ]);
    render(<UsersPage />);
    expect(await screen.findByText('justuname')).toBeInTheDocument();
    expect(screen.getByText('only@email.com')).toBeInTheDocument();
    // country null -> em dash (appears for both rows)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('applies role and status filters', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      user({ id: 'u-viewer', role: 'VIEWER', status: 'ACTIVE', profile: { displayName: 'Viewer Row' } }),
      user({ id: 'u-admin', role: 'ADMIN', status: 'SUSPENDED', profile: { displayName: 'Admin Row' } })
    ]);
    render(<UsersPage />);
    await screen.findByText('Viewer Row');

    const selects = screen.getAllByRole('combobox');
    // role filter = ADMIN
    fireEvent.change(selects[0], { target: { value: 'ADMIN' } });
    expect(screen.queryByText('Viewer Row')).not.toBeInTheDocument();
    expect(screen.getByText('Admin Row')).toBeInTheDocument();

    // status filter = SUSPENDED (still matches admin row)
    fireEvent.change(selects[1], { target: { value: 'SUSPENDED' } });
    expect(screen.getByText('Admin Row')).toBeInTheDocument();

    // status filter mismatch -> empty
    fireEvent.change(selects[1], { target: { value: 'BANNED' } });
    expect(screen.queryByText('Admin Row')).not.toBeInTheDocument();
  });

  it('searches via the filter form, encoding the query', async () => {
    vi.mocked(adminGet).mockResolvedValue([user()]);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    const input = screen.getByPlaceholderText('Search email / username / phone');
    fireEvent.change(input, { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(adminGet).toHaveBeenLastCalledWith('/admin/users?q=a%20b')
    );
  });

  it('suspends a user when confirmed', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'ACTIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/users/user-1234567890/suspend', { reason: 'admin action' })
    );
  });

  it('does not suspend when confirm is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'ACTIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('bans a user when confirmed', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'ACTIVE' })]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/users/user-1234567890/ban', { reason: 'admin action' })
    );
  });

  it('reactivates a non-active user', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'SUSPENDED' })]);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate User' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/users/user-1234567890/reactivate')
    );
  });

  it('shows loading-less initial render before fetch resolves', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(adminGet).mockReturnValue(new Promise((r) => (resolve = r)) as never);
    render(<UsersPage />);
    // header is rendered immediately
    expect(screen.getByText('Users')).toBeInTheDocument();
    resolve([]);
    await screen.findByText('No users match this search.');
  });
});
