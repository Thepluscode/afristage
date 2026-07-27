import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

let path = '/users';
vi.mock('next/navigation', () => ({ usePathname: () => path, useRouter: () => ({ push: vi.fn() }) }));

import { adminGet, adminLogout } from '../lib/api';

// Topbar fires /auth/me + /notifications/unread-count on mount; keep them resolving.
beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue({} as any);
});

afterEach(() => {
  vi.resetModules();
  path = '/users';
});

async function loadChrome() {
  vi.resetModules();
  const mod = await import('../app/chrome');
  return mod.AdminChrome;
}

describe('AdminChrome', () => {
  it('renders the full shell on a normal route', async () => {
    path = '/users';
    const AdminChrome = await loadChrome();
    const { container } = render(<AdminChrome><div>page-body</div></AdminChrome>);

    expect(screen.getByText('page-body')).toBeInTheDocument();
    expect(screen.getByText('AfriStage')).toBeInTheDocument();
    // "Mission control" appears both in the brand subtitle and the topbar
    expect(screen.getAllByText('Mission control').length).toBeGreaterThan(0);
    // nav groups render
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('Money')).toBeInTheDocument();
    expect(screen.getByText('System')).toBeInTheDocument();
    // active link matches the pathname
    const usersLink = container.querySelector('a.active');
    expect(usersLink).toHaveAttribute('href', '/users');
  });

  it('wires the logout button to adminLogout', async () => {
    path = '/users';
    const AdminChrome = await loadChrome();
    render(<AdminChrome><div /></AdminChrome>);
    const logoutBtn = screen.getByRole('button', { name: /Log out/ });
    logoutBtn.click();
    expect(vi.mocked(adminLogout)).toHaveBeenCalled();
  });

  it('toggles the mobile sidebar drawer via the hamburger and closes it via the scrim', async () => {
    path = '/users';
    const AdminChrome = await loadChrome();
    const { container } = render(<AdminChrome><div /></AdminChrome>);

    expect(container.querySelector('.sidebar')?.className).toBe('sidebar');
    expect(container.querySelector('.sidebar-scrim')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(container.querySelector('.sidebar')?.className).toBe('sidebar open');
    const scrim = container.querySelector('.sidebar-scrim');
    expect(scrim).not.toBeNull();

    fireEvent.click(scrim!);
    expect(container.querySelector('.sidebar')?.className).toBe('sidebar');
    expect(container.querySelector('.sidebar-scrim')).toBeNull();
  });

  it('returns just the children on the /login route (early return)', async () => {
    path = '/login';
    const AdminChrome = await loadChrome();
    render(<AdminChrome><div>login-child</div></AdminChrome>);
    expect(screen.getByText('login-child')).toBeInTheDocument();
    // shell chrome must NOT render
    expect(screen.queryByText('AfriStage')).not.toBeInTheDocument();
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
  });

  it('returns just the children on public marketing routes', async () => {
    path = '/site';
    const AdminChrome = await loadChrome();
    render(<AdminChrome><div>site-child</div></AdminChrome>);
    expect(screen.getByText('site-child')).toBeInTheDocument();
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
  });

  it('badges the sidebar from the dashboard counts and reports the system healthy', async () => {
    path = '/users';
    vi.mocked(adminGet).mockImplementation((p: string) =>
      p === '/admin/dashboard'
        ? Promise.resolve({
            criticalReports: 7,
            pendingReports: 9,
            pendingPayouts: 0,
            failedPayments: 2,
            openSupportTickets: 4,
            pendingCreatorApprovals: 12
          } as any)
        : Promise.resolve({} as any)
    );
    const AdminChrome = await loadChrome();
    const { container } = render(<AdminChrome><div /></AdminChrome>);

    await waitFor(() => expect(container.querySelector('.system-status.ok')).not.toBeNull());
    expect(await screen.findByText('All systems operational · Production')).toBeInTheDocument();
    // reports 7, support 4, creators 12, payments 2 badge; payouts 0 does not
    const badges = [...container.querySelectorAll('.nav-badge')].map((b) => b.textContent);
    expect(badges.sort()).toEqual(['12', '2', '4', '7']);
  });

  it('marks the system degraded and drops the badges when the counts fetch fails', async () => {
    path = '/users';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(adminGet).mockImplementation((p: string) =>
      p === '/admin/dashboard' ? Promise.reject(new Error('counts boom')) : Promise.resolve({} as any)
    );
    const AdminChrome = await loadChrome();
    const { container } = render(<AdminChrome><div>body</div></AdminChrome>);

    await waitFor(() => expect(container.querySelector('.system-status.bad')).not.toBeNull());
    expect(screen.getByText(/Degraded — needs review/)).toBeInTheDocument();
    expect(container.querySelectorAll('.nav-badge')).toHaveLength(0);
    // navigation still works — the badges are decoration, not a dependency
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith('Sidebar counts unavailable', expect.any(Error));
  });

  it('does not set state after unmount on either settle path', async () => {
    path = '/users';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const settle of [
      () => Promise.resolve({ criticalReports: 5 } as any),
      () => Promise.reject(new Error('late boom'))
    ]) {
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => {
        release = r;
      });
      vi.mocked(adminGet).mockImplementation((p: string) =>
        p === '/admin/dashboard' ? gate.then(settle) : Promise.resolve({} as any)
      );
      const AdminChrome = await loadChrome();
      const { unmount } = render(<AdminChrome><div /></AdminChrome>);
      unmount();
      release();
      await gate.then(settle).catch(() => {});
      await Promise.resolve();
    }

    // React logs an "update on unmounted component" error if the guard is missing
    expect(err).not.toHaveBeenCalledWith(expect.stringContaining('unmounted'), expect.anything());
    warn.mockRestore();
    err.mockRestore();
  });

  it('skips the counts fetch entirely on a chromeless route', async () => {
    path = '/login';
    const AdminChrome = await loadChrome();
    render(<AdminChrome><div>login-child</div></AdminChrome>);
    expect(vi.mocked(adminGet)).not.toHaveBeenCalledWith('/admin/dashboard');
  });
});
