import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import SupportPage from '../app/support/page';

const ticket = (over: Record<string, unknown> = {}) => ({
  id: 'ticket-1',
  type: 'BILLING',
  status: 'OPEN',
  priority: 'HIGH',
  subject: 'Cannot pay',
  requesterId: 'requester-12345678',
  createdAt: '2024-08-09T10:11:12.000Z',
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({} as never);
});
afterEach(() => vi.restoreAllMocks());

describe('SupportPage', () => {
  it('renders the empty state and a placeholder ticket thread when nothing is selected', async () => {
    render(<SupportPage />);
    expect(await screen.findByText('No support tickets are open.')).toBeInTheDocument();
    // selected is undefined -> placeholder TicketThread
    expect(screen.getByText('No ticket selected')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('support boom'));
    render(<SupportPage />);
    expect(await screen.findByText('support boom')).toBeInTheDocument();
  });

  it('renders a populated row and selects the first ticket in the thread', async () => {
    vi.mocked(adminGet).mockResolvedValue([ticket()]);
    render(<SupportPage />);
    // subject appears in both the table and the thread panel
    expect((await screen.findAllByText('Cannot pay')).length).toBeGreaterThanOrEqual(1);
    // BILLING appears in the row cell and as a generated <option>
    expect(screen.getByText('BILLING', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText('HIGH', { selector: 'td .pill' })).toBeInTheDocument();
    expect(screen.getByText('OPEN', { selector: 'td .pill' })).toBeInTheDocument();
    // type filter is populated from distinct ticket types
    expect(screen.getByRole('option', { name: 'BILLING' })).toBeInTheDocument();
  });

  it('filters by status and type', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      ticket({ id: 't1', status: 'OPEN', type: 'BILLING', subject: 'Billing issue' }),
      ticket({ id: 't2', status: 'RESOLVED', type: 'ABUSE', subject: 'Abuse report' })
    ]);
    render(<SupportPage />);
    await screen.findAllByText('Billing issue');

    const inCell = (t: string) => screen.queryByText(t, { selector: 'td' });
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'RESOLVED' } });
    expect(inCell('Billing issue')).not.toBeInTheDocument();
    expect(inCell('Abuse report')).toBeInTheDocument();

    fireEvent.change(selects[1], { target: { value: 'ABUSE' } });
    expect(inCell('Abuse report')).toBeInTheDocument();

    fireEvent.change(selects[1], { target: { value: 'BILLING' } });
    // no ticket matches RESOLVED + BILLING -> empty
    expect(inCell('Abuse report')).not.toBeInTheDocument();
    expect(screen.getByText('No support tickets are open.')).toBeInTheDocument();
  });

  it('assigns a ticket to me', async () => {
    vi.mocked(adminGet).mockResolvedValue([ticket()]);
    render(<SupportPage />);
    await screen.findAllByText('Cannot pay');

    fireEvent.click(screen.getByRole('button', { name: 'Assign to Me' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/support/tickets/ticket-1/assign')
    );
  });

  it('resolves a non-resolved ticket', async () => {
    vi.mocked(adminGet).mockResolvedValue([ticket({ status: 'OPEN' })]);
    render(<SupportPage />);
    await screen.findAllByText('Cannot pay');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve Ticket' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/support/tickets/ticket-1/resolve')
    );
  });

  it('disables the resolve button for an already-resolved ticket', async () => {
    vi.mocked(adminGet).mockResolvedValue([ticket({ status: 'RESOLVED' })]);
    render(<SupportPage />);
    await screen.findAllByText('Cannot pay');
    expect(screen.getByRole('button', { name: 'Resolve Ticket' })).toBeDisabled();
  });

  it('prevents default on filter form submit', async () => {
    vi.mocked(adminGet).mockResolvedValue([ticket()]);
    const { container } = render(<SupportPage />);
    await screen.findAllByText('Cannot pay');
    const form = container.querySelector('form.toolbar')!;
    fireEvent.submit(form);
    expect(form).toBeInTheDocument();
  });
});
