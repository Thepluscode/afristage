import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

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
afterEach(() => {
  vi.restoreAllMocks();
  nav.search = '';
});

describe('UsersPage', () => {
  it('renders the empty state when no users match', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<UsersPage />);
    expect(await screen.findByText('No users match this search.')).toBeInTheDocument();
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=user-b';
    vi.mocked(adminGet).mockResolvedValue([user({ id: 'user-a' }), user({ id: 'user-b' })]);
    const { container } = render(<UsersPage />);
    await waitFor(() => expect(container.querySelector('#row-user-b')).not.toBeNull());
    expect(container.querySelector('#row-user-b')?.className).toContain('row-highlight');
    expect(container.querySelector('#row-user-a')?.className || '').not.toContain('row-highlight');
  });

  it('moves the highlight when ?id= changes without a remount (re-search on the same page)', async () => {
    nav.search = 'id=user-a';
    vi.mocked(adminGet).mockResolvedValue([user({ id: 'user-a' }), user({ id: 'user-b' })]);
    const { container, rerender } = render(<UsersPage />);
    await waitFor(() => expect(container.querySelector('#row-user-a')).not.toBeNull());
    expect(container.querySelector('#row-user-a')?.className).toContain('row-highlight');
    // re-search: same mounted page, new ?id=
    nav.search = 'id=user-b';
    rerender(<UsersPage />);
    expect(container.querySelector('#row-user-b')?.className).toContain('row-highlight');
    expect(container.querySelector('#row-user-a')?.className || '').not.toContain('row-highlight');
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
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' })); // trigger
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' })); // confirm
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/users/user-1234567890/suspend', { reason: 'admin action' })
    );
  });

  it('does not suspend when the dialog is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'ACTIVE' })]);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Suspend' })); // trigger
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('bans a user when confirmed', async () => {
    vi.mocked(adminGet).mockResolvedValue([user({ status: 'ACTIVE' })]);
    render(<UsersPage />);
    await screen.findByText('Display Name');

    fireEvent.click(screen.getByRole('button', { name: 'Ban' })); // trigger
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ban' })); // confirm
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
describe('UsersPage sessions panel', () => {
  const session = (over: Partial<any> = {}) => ({
    id: 's1', device: 'Pixel 8', ip: '1.2.3.4', userAgent: 'okhttp',
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    lastSeenAt: new Date('2026-07-07T00:00:00Z').toISOString(), ...over
  });
  const userRow = { id: 'u1', email: 'v@a.live', role: 'VIEWER', status: 'ACTIVE', profile: { displayName: 'Demo Viewer' } };

  function stub(map: Record<string, unknown>) {
    vi.mocked(adminGet).mockImplementation((path: string) =>
      path in map ? Promise.resolve(map[path] as any) : Promise.reject(new Error(`unexpected GET ${path}`)));
  }

  it('opens the panel, shows devices with fallbacks, revokes one, revokes all, closes', async () => {
    stub({
      '/admin/users': [userRow],
      '/admin/users/u1/sessions': [session(), session({ id: 's2', device: null, userAgent: null, ip: null })]
    });
    vi.mocked(adminPost).mockResolvedValue({});
    render(<UsersPage />);
    await screen.findByText('Demo Viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
    expect(await screen.findByText(/Signed-in devices for/)).toBeInTheDocument();
    expect(screen.getByText('Pixel 8')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument(); // null label+ua
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // null ip (user row also renders dashes)

    // revoke one (confirm-first)
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[0]);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/users/u1/sessions/s1/revoke'));

    // revoke all
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out Everywhere' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign Out Everywhere' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/users/u1/sessions/revoke-all'));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Signed-in devices for/)).not.toBeInTheDocument();
  });

  it('an empty session list explains itself (email header fallback)', async () => {
    stub({ '/admin/users': [{ ...userRow, profile: null }], '/admin/users/u1/sessions': [] });
    render(<UsersPage />);
    await screen.findByText('v@a.live');
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
    expect(await screen.findByText('No active sessions.')).toBeInTheDocument();
    expect(screen.getByText(/Signed-in devices for/).textContent).toContain('v@a.live');
  });

  it('falls back to the user id in the header when there is no name or email', async () => {
    stub({ '/admin/users': [{ ...userRow, profile: null, email: null }], '/admin/users/u1/sessions': [] });
    render(<UsersPage />);
    await screen.findByRole('button', { name: 'Sessions' });
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
    expect((await screen.findByText(/Signed-in devices for/)).textContent).toContain('u1');
  });

  it('a failing sessions fetch surfaces the error state', async () => {
    stub({ '/admin/users': [userRow] }); // sessions path rejects
    render(<UsersPage />);
    await screen.findByText('Demo Viewer');
    fireEvent.click(screen.getByRole('button', { name: 'Sessions' }));
    expect(await screen.findByText(/unexpected GET \/admin\/users\/u1\/sessions/)).toBeInTheDocument();
  });
});

