import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminDelete: vi.fn(),
  adminLogout: vi.fn()
}));

const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { adminGet, adminPatch, adminPost } from '../lib/api';
import ShopsPage from '../app/shops/page';

afterEach(() => {
  vi.restoreAllMocks();
  nav.search = '';
});

const shop = (over: Partial<any> = {}) => ({
  id: 's1',
  name: 'Ada Threads',
  slug: 'ada-threads',
  description: null,
  externalUrl: null,
  status: 'APPROVED',
  createdAt: new Date('2026-08-01T00:00:00Z').toISOString(),
  ownerUserId: 'u1',
  _count: { products: 3, orders: 12 },
  ...over
});

const detail = (over: Partial<any> = {}) => ({
  shop: { ...shop(), owner: { id: 'u1', email: 'ada@example.com', profile: { displayName: 'Ada', username: 'ada' } } },
  products: [
    { id: 'p1', title: 'Ankara Tee', priceCoins: 1200, stock: 4, externalUrl: null, clickCount: 0, status: 'ACTIVE' }
  ],
  ...over
});

function stubGets(map: Record<string, unknown>) {
  vi.mocked(adminGet).mockImplementation((path: string) => {
    if (path in map) return Promise.resolve(map[path] as any);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('ShopsPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('shops-boom'));
    render(<ShopsPage />);
    expect(await screen.findByText('shops-boom')).toBeInTheDocument();
  });

  it('empty -> empty state', async () => {
    stubGets({ '/admin/shops': [] });
    render(<ShopsPage />);
    expect(await screen.findByText(/No shops yet/)).toBeInTheDocument();
  });

  it('renders shops with kind, counts, status, and missing-count fallback', async () => {
    stubGets({
      '/admin/shops': [
        shop(),
        shop({ id: 's2', name: 'Bronzea', slug: 'bronzea', externalUrl: 'https://bronzea.example', status: 'PENDING', _count: undefined })
      ]
    });
    render(<ShopsPage />);
    expect(await screen.findByText('Ada Threads')).toBeInTheDocument();
    expect(screen.getByText('/ada-threads')).toBeInTheDocument();
    expect(screen.getByText('In-app')).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0); // missing _count
  });

  // The queue exists so nothing sits unreviewed; the count is the nudge.
  it('surfaces how many shops are awaiting review, and hides the banner when none are', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'PENDING' })] });
    const { unmount } = render(<ShopsPage />);
    expect(await screen.findByText(/awaiting review/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    unmount();

    stubGets({ '/admin/shops': [shop()] });
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    expect(screen.queryByText(/awaiting review/)).not.toBeInTheDocument();
  });

  it('pluralises the pending banner', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'PENDING' }), shop({ id: 's2', status: 'PENDING' })] });
    render(<ShopsPage />);
    expect(await screen.findByText(/shops awaiting review/)).toBeInTheDocument();
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=s2';
    stubGets({ '/admin/shops': [shop(), shop({ id: 's2', name: 'Second' })] });
    const { container } = render(<ShopsPage />);
    await waitFor(() => expect(container.querySelector('#row-s2')).not.toBeNull());
    expect(container.querySelector('#row-s2')?.className).toContain('row-highlight');
  });

  it('onboard: early-return on empty fields, then posts with the referral URL only when given', async () => {
    stubGets({ '/admin/shops': [] });
    vi.mocked(adminPost).mockResolvedValue({});
    const { container } = render(<ShopsPage />);
    await screen.findByText(/No shops yet/);

    fireEvent.submit(container.querySelector('form.toolbar') as HTMLFormElement);
    expect(adminPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'u9' } });
    fireEvent.change(screen.getByPlaceholderText('Shop name'), { target: { value: 'Plain Shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Shop' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/shops', { ownerUserId: 'u9', name: 'Plain Shop' }));

    // The referral path — how Bronzea is onboarded.
    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'u10' } });
    fireEvent.change(screen.getByPlaceholderText('Shop name'), { target: { value: 'Bronzea' } });
    fireEvent.change(screen.getByPlaceholderText('Referral URL (blank = sells in-app)'), {
      target: { value: 'https://bronzea.example' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Shop' }));
    await waitFor(() =>
      expect(vi.mocked(adminPost).mock.calls.at(-1)).toEqual([
        '/admin/shops',
        { ownerUserId: 'u10', name: 'Bronzea', externalUrl: 'https://bronzea.example' }
      ])
    );
  });

  it('onboard failure surfaces the API error', async () => {
    stubGets({ '/admin/shops': [] });
    vi.mocked(adminPost).mockRejectedValue(new Error('This account already has a shop'));
    render(<ShopsPage />);
    await screen.findByText(/No shops yet/);
    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'u9' } });
    fireEvent.change(screen.getByPlaceholderText('Shop name'), { target: { value: 'Dupe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onboard Shop' }));
    expect(await screen.findByText('This account already has a shop')).toBeInTheDocument();
  });

  it('approve patches the status; a pending shop offers no suspend action', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'PENDING' })] });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/shops/s1/status', { status: 'APPROVED' }));
  });

  // Suspension pulls products out of every live room, so it is behind a confirm.
  it('suspend asks first, then patches', async () => {
    stubGets({ '/admin/shops': [shop()] });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    expect(within(screen.getByRole('dialog')).getByText(/disappear from every live room/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/shops/s1/status', { status: 'SUSPENDED' }));
  });

  it('a suspended shop can be approved again', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'SUSPENDED' })] });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/shops/s1/status', { status: 'APPROVED' }));
  });

  it('status-change failure surfaces the API error', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'PENDING' })] });
    vi.mocked(adminPatch).mockRejectedValue(new Error('Shop not found'));
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Shop not found')).toBeInTheDocument();
  });

  it('detail: names the owner and lists products with stock and kind', async () => {
    stubGets({ '/admin/shops': [shop()], '/admin/shops/s1': detail() });
    const { container } = render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('Ankara Tee')).toBeInTheDocument();
    // Scoped to the detail banner — "Ada" also appears in the shop row.
    expect(container.querySelector('.banner-ok')?.textContent).toContain('owner Ada');
    expect(screen.getByText('1,200 coins')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // Twice: the shop's own kind in the table, and the product's kind in the panel.
    expect(screen.getAllByText('In-app')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Ankara Tee')).not.toBeInTheDocument();
  });

  it('detail: a referral shop shows where it sends people and how many taps it earned', async () => {
    const referral = detail({
      shop: {
        ...shop({ externalUrl: 'https://bronzea.example' }),
        owner: { id: 'u1', email: 'ops@example.com', profile: null }
      },
      products: [
        { id: 'p2', title: 'Shea Butter', priceCoins: 900, stock: null, externalUrl: 'https://bronzea.example/p2', clickCount: 41, status: 'ACTIVE' }
      ]
    });
    stubGets({ '/admin/shops': [shop()], '/admin/shops/s1': referral });
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('https://bronzea.example')).toBeInTheDocument();
    expect(screen.getByText('Link-out · 41 taps')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.getByText(/ops@example.com/)).toBeInTheDocument(); // profile-less owner falls back to email
  });

  it('detail: owner with neither profile nor email falls back to the user id', async () => {
    const bare = detail({
      shop: { ...shop(), owner: { id: 'u1', email: null, profile: null } }
    });
    stubGets({ '/admin/shops': [shop()], '/admin/shops/s1': bare });
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/u1/)).toBeInTheDocument();
  });

  it('detail: a shop with nothing listed says so', async () => {
    stubGets({ '/admin/shops': [shop()], '/admin/shops/s1': detail({ products: [] }) });
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('Nothing listed yet.')).toBeInTheDocument();
  });

  it('detail load failure surfaces the error', async () => {
    stubGets({ '/admin/shops': [shop()] });
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    vi.mocked(adminGet).mockRejectedValue(new Error('detail-boom'));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('detail-boom')).toBeInTheDocument();
  });

  // Approving from inside the detail panel must refresh the panel too, or the
  // reviewer is looking at a stale status.
  it('a status change while the detail panel is open refreshes it', async () => {
    stubGets({ '/admin/shops': [shop({ status: 'PENDING' })], '/admin/shops/s1': detail() });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<ShopsPage />);
    await screen.findByText('Ada Threads');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await screen.findByText('Ankara Tee');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(vi.mocked(adminGet).mock.calls.filter((c) => c[0] === '/admin/shops/s1').length).toBe(2));
  });
});
