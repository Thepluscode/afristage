import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminLogout, adminPost } from '../lib/api';
import { Topbar } from '../app/topbar';

const navItems = [
  { label: 'Payouts', href: '/payouts', group: 'Money' },
  { label: 'Payments', href: '/payments', group: 'Money' },
  { label: 'Users', href: '/users', group: 'People' }
];

const onMenu = vi.fn();

// Default: identity resolves, no unread, notifications empty.
function mockApi({
  me = { sub: 'u1', email: 'admin@afristage.local', role: 'SUPER_ADMIN' } as any,
  meReject = false,
  count = 0,
  countReject = false,
  notifs = [] as any[]
} = {}) {
  vi.mocked(adminGet).mockImplementation((p: string) => {
    if (p === '/auth/me') return meReject ? Promise.reject(new Error('x')) : Promise.resolve(me);
    if (p === '/notifications/unread-count') return countReject ? Promise.reject(new Error('x')) : Promise.resolve({ count });
    if (p === '/notifications/me') return Promise.resolve(notifs);
    return Promise.resolve(undefined);
  });
}

function renderTopbar() {
  return render(<Topbar onMenu={onMenu} navItems={navItems} />);
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});
beforeEach(() => mockApi());

describe('Topbar identity + badge', () => {
  it('shows the role and email from /auth/me', async () => {
    mockApi({ count: 3 });
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' })); // ensure mount effects ran
    await waitFor(() => expect(screen.getByText('admin@afristage.local')).toBeInTheDocument());
    expect(screen.getByText('SUPER ADMIN')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // unread badge
  });

  it('falls back to "Admin" when /auth/me fails and shows no badge when count fails', async () => {
    mockApi({ meReject: true, countReject: true });
    renderTopbar();
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
    expect(screen.getByText('Admin Operator')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('caps the badge at 99+', async () => {
    mockApi({ count: 250 });
    renderTopbar();
    await waitFor(() => expect(screen.getByText('99+')).toBeInTheDocument());
  });

  it('uses the user id when email is absent', async () => {
    mockApi({ me: { sub: 'user-42', role: 'MODERATOR' } });
    renderTopbar();
    await waitFor(() => expect(screen.getByText('user-42')).toBeInTheDocument());
    expect(screen.getByText('MODERATOR')).toBeInTheDocument();
  });
});

describe('Topbar theme toggle', () => {
  it('toggles dark -> light -> dark and persists', async () => {
    renderTopbar();
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('afristage-admin-theme')).toBe('light');
    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('afristage-admin-theme')).toBe('dark');
  });

  it('reflects an already-light document on mount', async () => {
    document.documentElement.dataset.theme = 'light';
    renderTopbar();
    const btn = screen.getByRole('button', { name: 'Toggle theme' });
    fireEvent.click(btn); // light -> dark
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('survives localStorage being unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
    expect(document.documentElement.dataset.theme).toBe('light'); // DOM still updated
  });
});

describe('Topbar search quick-nav', () => {
  it('filters sections, navigates on click, and clears', async () => {
    renderTopbar();
    const input = screen.getByPlaceholderText('Jump to a section…');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'pay' } });
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('Payouts')).toBeInTheDocument();
    expect(within(listbox).getByText('Payments')).toBeInTheDocument();
    fireEvent.click(within(listbox).getByRole('option', { name: /Payouts/ }));
    expect(push).toHaveBeenCalledWith('/payouts');
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('navigates to the first match on Enter', async () => {
    renderTopbar();
    const input = screen.getByPlaceholderText('Jump to a section…');
    fireEvent.change(input, { target: { value: 'user' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/users');
  });

  it('does nothing on Enter when there is no match', async () => {
    renderTopbar();
    const input = screen.getByPlaceholderText('Jump to a section…');
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText(/No section matches/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Topbar notifications', () => {
  it('opens, shows loading then a list (read + unread, with/without body), and toggles closed', async () => {
    mockApi({
      count: 2,
      notifs: [
        { id: 'n1', title: 'Unread one', body: 'has body', readAt: null, createdAt: '2026-06-01T00:00:00Z' },
        { id: 'n2', title: 'Read two', body: null, readAt: '2026-06-02T00:00:00Z', createdAt: '2026-06-02T00:00:00Z' }
      ]
    });
    renderTopbar();
    const bell = screen.getByRole('button', { name: 'Notifications' });
    fireEvent.click(bell);
    await waitFor(() => expect(screen.getByText('Unread one')).toBeInTheDocument());
    expect(screen.getByText('has body')).toBeInTheDocument();
    expect(screen.getByText('Read two')).toBeInTheDocument();
    fireEvent.click(bell); // toggle closed
    expect(screen.queryByText('Unread one')).not.toBeInTheDocument();
  });

  it('marks all read while the list is still loading (no list to map)', async () => {
    vi.mocked(adminGet).mockImplementation((p: string) => {
      if (p === '/auth/me') return Promise.resolve({ sub: 'u', role: 'ADMIN' });
      if (p === '/notifications/unread-count') return Promise.resolve({ count: 4 });
      if (p === '/notifications/me') return new Promise(() => {}); // never resolves -> stays loading
      return Promise.resolve(undefined);
    });
    vi.mocked(adminPost).mockResolvedValueOnce({ ok: true } as any);
    renderTopbar();
    await waitFor(() => expect(screen.getByText('4')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(screen.queryByText('4')).not.toBeInTheDocument());
  });

  it('shows the empty state when there are no notifications', async () => {
    mockApi({ notifs: [] });
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await waitFor(() => expect(screen.getByText(/all caught up/)).toBeInTheDocument());
  });

  it('falls back to an empty list when the fetch fails', async () => {
    vi.mocked(adminGet).mockImplementation((p: string) => {
      if (p === '/notifications/me') return Promise.reject(new Error('boom'));
      if (p === '/auth/me') return Promise.resolve({ sub: 'u', role: 'ADMIN' });
      return Promise.resolve({ count: 0 });
    });
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await waitFor(() => expect(screen.getByText(/all caught up/)).toBeInTheDocument());
  });

  it('marks all read (clears the badge) and tolerates a failing mark-all', async () => {
    mockApi({
      count: 5,
      notifs: [
        { id: 'n1', title: 'Hi', readAt: null, createdAt: '2026-06-01T00:00:00Z' },
        { id: 'n2', title: 'Already read', readAt: '2026-06-03T00:00:00Z', createdAt: '2026-06-02T00:00:00Z' }
      ]
    });
    vi.mocked(adminPost).mockResolvedValueOnce({ ok: true } as any);
    renderTopbar();
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(screen.queryByText('5')).not.toBeInTheDocument());
    expect(adminPost).toHaveBeenCalledWith('/notifications/read-all');

    // failing mark-all is swallowed
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' })); // close
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' })); // open
    await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
    vi.mocked(adminPost).mockRejectedValueOnce(new Error('nope'));
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/ }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledTimes(2));
  });
});

describe('Topbar profile menu', () => {
  it('opens, exposes log out, and wires it to adminLogout', async () => {
    renderTopbar();
    const trigger = screen.getByRole('button', { name: /Super Admin|SUPER ADMIN|Admin/ });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Log out/ }));
    expect(adminLogout).toHaveBeenCalled();
  });

  it('toggles the profile menu closed on a second click', async () => {
    renderTopbar();
    const trigger = screen.getByRole('button', { name: /Admin/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows the user id in the panel when email is absent', async () => {
    mockApi({ me: { sub: 'user-77', role: 'MODERATOR' } });
    renderTopbar();
    await waitFor(() => expect(screen.getAllByText('user-77').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /Admin|MODERATOR/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('user-77')).toBeInTheDocument();
  });

  it('shows "Signed in" in the panel when both email and id are absent', async () => {
    mockApi({ me: { role: 'ADMIN' } });
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Signed in')).toBeInTheDocument();
  });
});

describe('Topbar dismissal + menu button', () => {
  it('closes an open panel on outside click and on Escape (ignoring other keys)', async () => {
    renderTopbar();
    const trigger = screen.getByRole('button', { name: /Admin/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // ignored
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body); // outside click
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('calls onMenu when the hamburger is clicked', async () => {
    renderTopbar();
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onMenu).toHaveBeenCalled();
  });
});
