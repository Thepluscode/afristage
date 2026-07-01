import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
const nav = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { adminGet } from '../lib/api';
import PaymentsPage from '../app/payments/page';

afterEach(() => {
  vi.clearAllMocks();
  nav.search = '';
});

describe('PaymentsPage', () => {
  it('shows loading (empty table) until data arrives', () => {
    vi.mocked(adminGet).mockReturnValue(new Promise(() => {}));
    render(<PaymentsPage />);
    expect(screen.getByText('No payments have been recorded.')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('boom-payments'));
    render(<PaymentsPage />);
    expect(await screen.findByText('boom-payments')).toBeInTheDocument();
  });

  it('highlights the row targeted by ?id=', async () => {
    nav.search = 'id=pay-b';
    vi.mocked(adminGet).mockResolvedValue([
      { id: 'pay-a', provider: 'STRIPE', amountMinor: 100, currency: 'USD', coinAmount: 10, status: 'SUCCEEDED', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'pay-b', provider: 'STRIPE', amountMinor: 200, currency: 'USD', coinAmount: 20, status: 'PENDING', createdAt: '2024-01-02T00:00:00Z' }
    ]);
    const { container } = render(<PaymentsPage />);
    await waitFor(() => expect(container.querySelector('#row-pay-b')).not.toBeNull());
    expect(container.querySelector('#row-pay-b')?.className).toContain('row-highlight');
    expect(container.querySelector('#row-pay-a')?.className || '').not.toContain('row-highlight');
  });

  it('renders rows with both branches of optional fields', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      {
        id: 'pay_1234567890abc',
        provider: 'STRIPE',
        amountMinor: 5000,
        currency: 'USD',
        coinAmount: 1000,
        status: 'SUCCEEDED',
        createdAt: '2024-01-01T00:00:00Z',
        user: { profile: { displayName: 'Dana' } },
        reference: 'REF-1',
        processedAt: '2024-01-02T00:00:00Z',
        webhookStatus: 'OK'
      },
      {
        // no reference (uses id.slice), no user (uses '—'), no processedAt, no webhookStatus (PENDING fallback)
        id: 'pay_secondrowid999',
        provider: 'PAYSTACK',
        amountMinor: 200,
        currency: 'NGN',
        coinAmount: 50,
        status: 'FAILED',
        createdAt: '2024-01-03T00:00:00Z'
      }
    ]);
    render(<PaymentsPage />);
    expect(await screen.findByText('REF-1')).toBeInTheDocument();
    // id.slice(0,10) fallback for the second row
    expect(screen.getByText('pay_second')).toBeInTheDocument();
    expect(screen.getByText('Dana')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0); // processedAt fallback / user fallback
    expect(screen.getByText('PENDING')).toBeInTheDocument(); // webhook fallback
  });

  it('covers user fallbacks: username then email', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      { id: 'a', provider: 'P', amountMinor: 1, currency: 'USD', coinAmount: 1, status: 'OK', createdAt: '2024-01-01T00:00:00Z', user: { profile: { username: 'uname' } } },
      { id: 'b', provider: 'P', amountMinor: 1, currency: 'USD', coinAmount: 1, status: 'OK', createdAt: '2024-01-01T00:00:00Z', user: { email: 'e@x.com' } }
    ]);
    render(<PaymentsPage />);
    expect(await screen.findByText('uname')).toBeInTheDocument();
    expect(screen.getByText('e@x.com')).toBeInTheDocument();
  });

  it('filters by provider and status', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      { id: 'r1', provider: 'STRIPE', amountMinor: 1, currency: 'USD', coinAmount: 1, status: 'SUCCEEDED', createdAt: '2024-01-01T00:00:00Z', reference: 'KEEP' },
      { id: 'r2', provider: 'PAYSTACK', amountMinor: 1, currency: 'USD', coinAmount: 1, status: 'FAILED', createdAt: '2024-01-01T00:00:00Z', reference: 'DROP' }
    ]);
    render(<PaymentsPage />);
    await screen.findByText('KEEP');
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'STRIPE' } });
    await waitFor(() => expect(screen.queryByText('DROP')).not.toBeInTheDocument());
    expect(screen.getByText('KEEP')).toBeInTheDocument();
    // status filter to something that excludes the remaining row
    fireEvent.change(selects[1], { target: { value: 'FAILED' } });
    await waitFor(() => expect(screen.queryByText('KEEP')).not.toBeInTheDocument());
  });

  it('submit on the filter bar is prevented (no throw)', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    const { container } = render(<PaymentsPage />);
    await screen.findByText('No payments have been recorded.');
    const form = container.querySelector('form.toolbar') as HTMLFormElement;
    fireEvent.submit(form);
  });
});
