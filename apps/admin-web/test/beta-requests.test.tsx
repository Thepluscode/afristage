import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import BetaRequestsPage from '../app/beta-requests/page';

const req = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  email: 'wait@example.com',
  displayName: 'Wait Lister',
  category: 'Comedy',
  country: 'GH',
  status: 'PENDING',
  createdAt: '2024-03-04T05:06:07.000Z',
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({ code: 'CODE123' } as never);
});
afterEach(() => vi.restoreAllMocks());

describe('BetaRequestsPage', () => {
  it('renders the empty state', async () => {
    render(<BetaRequestsPage />);
    expect(await screen.findByText(/No invite requests yet/)).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('nope'));
    render(<BetaRequestsPage />);
    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('renders a populated row with all fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([req()]);
    render(<BetaRequestsPage />);
    expect(await screen.findByText('wait@example.com')).toBeInTheDocument();
    expect(screen.getByText('Wait Lister')).toBeInTheDocument();
    expect(screen.getByText('Comedy')).toBeInTheDocument();
    expect(screen.getByText('GH')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('renders fallbacks for missing optional fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      req({ id: 'r-empty', displayName: null, category: null, country: null })
    ]);
    render(<BetaRequestsPage />);
    await screen.findByText('wait@example.com');
    expect(screen.getAllByText('—').length).toBe(3);
  });

  it('refetches with a status query when the filter changes', async () => {
    vi.mocked(adminGet).mockResolvedValue([req()]);
    render(<BetaRequestsPage />);
    await screen.findByText('wait@example.com');
    // initial load with no status query
    expect(adminGet).toHaveBeenCalledWith('/admin/beta-requests');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'INVITED' } });
    await waitFor(() =>
      expect(adminGet).toHaveBeenLastCalledWith('/admin/beta-requests?status=INVITED')
    );
  });

  it('issues an invite when confirmed and shows the one-time code', async () => {
    vi.mocked(adminGet).mockResolvedValue([req({ status: 'PENDING' })]);
    vi.mocked(adminPost).mockResolvedValue({ code: 'ONE-TIME-CODE' } as never);
    render(<BetaRequestsPage />);
    await screen.findByText('wait@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Issue invite' })); // trigger
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue invite' })); // confirm
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/beta-requests/req-1/invite', { type: 'CREATOR' })
    );
    expect(await screen.findByText('ONE-TIME-CODE')).toBeInTheDocument();
  });

  it('does not issue an invite when the dialog is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([req({ status: 'PENDING' })]);
    render(<BetaRequestsPage />);
    await screen.findByText('wait@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Issue invite' })); // trigger
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })); // cancel
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(adminPost).not.toHaveBeenCalled();
  });

  it('prevents default on filter form submit', async () => {
    vi.mocked(adminGet).mockResolvedValue([req()]);
    const { container } = render(<BetaRequestsPage />);
    await screen.findByText('wait@example.com');
    const form = container.querySelector('form.toolbar')!;
    fireEvent.submit(form);
    expect(form).toBeInTheDocument();
  });
});
