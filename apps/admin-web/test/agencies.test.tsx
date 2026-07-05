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

import { adminDelete, adminGet, adminPatch, adminPost } from '../lib/api';
import AgenciesPage from '../app/agencies/page';

afterEach(() => {
  vi.restoreAllMocks();
  nav.search = '';
});

const agency = (over: Partial<any> = {}) => ({
  id: 'ag1',
  name: 'Lagos Talent Partners',
  country: 'NG',
  commissionBps: 1000,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
  _count: { creators: 1 },
  ...over
});

const detail = (over: Partial<any> = {}) => ({
  ...agency(),
  earningsCoins: '6',
  creators: [{ creatorUserId: 'c1', stageName: 'MC One', approvalStatus: 'APPROVED', addedAt: new Date(0).toISOString() }],
  ...over
});

// adminGet serves both the list and the creators dropdown; route by path.
function stubGets(map: Record<string, unknown>) {
  vi.mocked(adminGet).mockImplementation((path: string) => {
    if (path in map) return Promise.resolve(map[path] as any);
    return Promise.reject(new Error(`unexpected GET ${path}`));
  });
}

describe('AgenciesPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('agencies-boom'));
    render(<AgenciesPage />);
    expect(await screen.findByText('agencies-boom')).toBeInTheDocument();
  });

  it('empty -> empty state', async () => {
    stubGets({ '/admin/agencies': [], '/admin/creators': [] });
    render(<AgenciesPage />);
    expect(await screen.findByText(/No agencies yet/)).toBeInTheDocument();
  });

  it('renders agencies with commission %, status, and fallbacks', async () => {
    stubGets({
      '/admin/agencies': [agency(), agency({ id: 'ag2', name: 'Bare', country: null, _count: undefined, status: 'SUSPENDED', commissionBps: 2550 })],
      '/admin/creators': []
    });
    render(<AgenciesPage />);
    expect(await screen.findByText('Lagos Talent Partners')).toBeInTheDocument();
    expect(screen.getByText('10.0%')).toBeInTheDocument();
    expect(screen.getByText('25.5%')).toBeInTheDocument();
    expect(screen.getByText('NG')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // null country
    expect(screen.getByText('0')).toBeInTheDocument(); // missing count
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('SUSPENDED')).toBeInTheDocument();
    expect(screen.getByText('Reactivate')).toBeInTheDocument(); // suspended row
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=ag2';
    stubGets({ '/admin/agencies': [agency(), agency({ id: 'ag2', name: 'Second' })], '/admin/creators': [] });
    const { container } = render(<AgenciesPage />);
    await waitFor(() => expect(container.querySelector('#row-ag2')).not.toBeNull());
    expect(container.querySelector('#row-ag2')?.className).toContain('row-highlight');
  });

  it('create: early-return on empty fields, then posts with optional fields trimmed', async () => {
    stubGets({ '/admin/agencies': [], '/admin/creators': [] });
    vi.mocked(adminPost).mockResolvedValue({});
    const { container } = render(<AgenciesPage />);
    await screen.findByText(/No agencies yet/);
    fireEvent.submit(container.querySelector('form.toolbar') as HTMLFormElement);
    expect(adminPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Agency name'), { target: { value: 'New Agency' } });
    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'owner1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/agencies', { name: 'New Agency', ownerUserId: 'owner1' }));

    fireEvent.change(screen.getByPlaceholderText('Agency name'), { target: { value: 'Full Agency' } });
    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'owner2' } });
    fireEvent.change(screen.getByPlaceholderText('Country'), { target: { value: 'GH' } });
    fireEvent.change(screen.getByPlaceholderText('Commission bps (default 1000)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));
    await waitFor(() =>
      expect(vi.mocked(adminPost).mock.calls.at(-1)).toEqual(['/admin/agencies', { name: 'Full Agency', ownerUserId: 'owner2', country: 'GH', commissionBps: 2000 }])
    );
  });

  it('create failure surfaces the API error (bps cap)', async () => {
    stubGets({ '/admin/agencies': [], '/admin/creators': [] });
    vi.mocked(adminPost).mockRejectedValue(new Error('commissionBps must not be greater than 5000'));
    render(<AgenciesPage />);
    await screen.findByText(/No agencies yet/);
    fireEvent.change(screen.getByPlaceholderText('Agency name'), { target: { value: 'Greedy' } });
    fireEvent.change(screen.getByPlaceholderText('Owner user id'), { target: { value: 'owner1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));
    expect(await screen.findByText('commissionBps must not be greater than 5000')).toBeInTheDocument();
  });

  it('edit commission: cancel does nothing, save patches', async () => {
    stubGets({ '/admin/agencies': [agency()], '/admin/creators': [] });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Commission' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(adminPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Commission' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '2500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/agencies/ag1', { commissionBps: 2500 }));
  });

  it('suspend (confirm) and reactivate patch the status', async () => {
    stubGets({ '/admin/agencies': [agency(), agency({ id: 'ag2', name: 'Paused', status: 'SUSPENDED' })], '/admin/creators': [] });
    vi.mocked(adminPatch).mockResolvedValue({});
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/agencies/ag1', { status: 'SUSPENDED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    await waitFor(() => expect(adminPatch).toHaveBeenCalledWith('/admin/agencies/ag2', { status: 'ACTIVE' }));
  });

  it('detail: shows earnings + roster, assigns and removes creators', async () => {
    stubGets({
      '/admin/agencies': [agency()],
      '/admin/creators': [{ userId: 'c2', stageName: 'MC Two' }],
      '/admin/agencies/ag1': detail()
    });
    vi.mocked(adminPost).mockResolvedValue({});
    vi.mocked(adminDelete).mockResolvedValue({});
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText(/lifetime commission earned/)).toBeInTheDocument();
    expect(screen.getByText('MC One')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();

    // assign button disabled until a creator is picked
    expect(screen.getByRole('button', { name: 'Assign Creator' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Creator' }));
    await waitFor(() => expect(adminPost).toHaveBeenCalledWith('/admin/agencies/ag1/creators', { creatorUserId: 'c2' }));

    // remove with confirm
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(adminDelete).toHaveBeenCalledWith('/admin/agencies/ag1/creators/c1'));

    // close hides the panel
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/lifetime commission earned/)).not.toBeInTheDocument();
  });

  it('detail with an empty roster explains, name falls back to the user id', async () => {
    stubGets({
      '/admin/agencies': [agency()],
      '/admin/creators': [],
      '/admin/agencies/ag1': detail({ creators: [{ creatorUserId: 'c9', stageName: null, approvalStatus: null, addedAt: new Date(0).toISOString() }] })
    });
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('c9')).toBeInTheDocument(); // id fallback
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // approval fallback
  });

  it('detail with zero creators shows the empty-roster row', async () => {
    stubGets({
      '/admin/agencies': [agency()],
      '/admin/creators': [],
      '/admin/agencies/ag1': detail({ creators: [] })
    });
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('No creators assigned yet.')).toBeInTheDocument();
  });

  it('detail load failure and assign failure surface errors', async () => {
    stubGets({ '/admin/agencies': [agency()], '/admin/creators': [], '/admin/agencies/ag1': detail() });
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    vi.mocked(adminGet).mockRejectedValue(new Error('detail-boom'));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(await screen.findByText('detail-boom')).toBeInTheDocument();
  });

  it('assign failure (poaching) surfaces the API error', async () => {
    stubGets({
      '/admin/agencies': [agency()],
      '/admin/creators': [{ userId: 'c2', stageName: 'MC Two' }],
      '/admin/agencies/ag1': detail()
    });
    vi.mocked(adminPost).mockRejectedValue(new Error('Creator is already managed by another agency'));
    render(<AgenciesPage />);
    await screen.findByText('Lagos Talent Partners');
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    await screen.findByText(/lifetime commission earned/);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Creator' }));
    expect(await screen.findByText('Creator is already managed by another agency')).toBeInTheDocument();
  });
});
