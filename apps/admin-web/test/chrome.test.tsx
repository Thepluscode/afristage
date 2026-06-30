import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

let path = '/users';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

import { adminLogout } from '../lib/api';

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

  it('returns just the children on the /login route (early return)', async () => {
    path = '/login';
    const AdminChrome = await loadChrome();
    render(<AdminChrome><div>login-child</div></AdminChrome>);
    expect(screen.getByText('login-child')).toBeInTheDocument();
    // shell chrome must NOT render
    expect(screen.queryByText('AfriStage')).not.toBeInTheDocument();
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
  });
});
