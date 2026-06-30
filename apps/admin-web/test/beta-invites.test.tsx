import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminPatch: vi.fn(),
  adminLogout: vi.fn()
}));

import { adminGet, adminPost } from '../lib/api';
import BetaInvitesPage from '../app/beta-invites/page';

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  email: 'invitee@example.com',
  type: 'VIEWER',
  status: 'PENDING',
  expiresAt: '2024-05-06T07:08:09.000Z',
  ...over
});

beforeEach(() => {
  vi.mocked(adminGet).mockResolvedValue([]);
  vi.mocked(adminPost).mockResolvedValue({ code: 'CODE' } as never);
});
afterEach(() => vi.restoreAllMocks());

describe('BetaInvitesPage', () => {
  it('renders the empty state', async () => {
    render(<BetaInvitesPage />);
    expect(await screen.findByText('No beta invites have been created.')).toBeInTheDocument();
  });

  it('renders the error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('boom'));
    render(<BetaInvitesPage />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('renders a populated row with an email', async () => {
    vi.mocked(adminGet).mockResolvedValue([invite()]);
    render(<BetaInvitesPage />);
    expect(await screen.findByText('invitee@example.com')).toBeInTheDocument();
    // VIEWER also appears as a select <option>, scope to the type pill
    expect(document.querySelector('.pill.creator')).toHaveTextContent('VIEWER');
    expect(screen.getByText('PENDING', { selector: 'td .pill' })).toBeInTheDocument();
  });

  it('renders the fallback dash when email is missing', async () => {
    vi.mocked(adminGet).mockResolvedValue([invite({ id: 'inv-noemail', email: null })]);
    render(<BetaInvitesPage />);
    await screen.findByText('VIEWER');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('creates an invite with an email and shows the code', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    vi.mocked(adminPost).mockResolvedValue({ code: 'NEW-CODE' } as never);
    render(<BetaInvitesPage />);
    await screen.findByText('No beta invites have been created.');

    fireEvent.change(screen.getByPlaceholderText('Email (optional)'), { target: { value: 'x@y.com' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CREATOR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/beta-invites', { email: 'x@y.com', type: 'CREATOR' })
    );
    expect(await screen.findByText('NEW-CODE')).toBeInTheDocument();
  });

  it('creates an invite with no email (undefined branch)', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<BetaInvitesPage />);
    await screen.findByText('No beta invites have been created.');

    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/beta-invites', { email: undefined, type: 'VIEWER' })
    );
  });

  it('revokes a pending invite when confirmed (email body branch)', async () => {
    vi.mocked(adminGet).mockResolvedValue([invite({ status: 'PENDING' })]);
    render(<BetaInvitesPage />);
    await screen.findByText('invitee@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' })); // trigger
    const dialog = screen.getByRole('dialog');
    // body uses the email
    expect(within(dialog).getByText(/Revoke invite for invitee@example\.com\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' })); // confirm
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/beta-invites/inv-1/revoke')
    );
  });

  it('revokes using the type in the body when email is missing', async () => {
    vi.mocked(adminGet).mockResolvedValue([invite({ id: 'inv-noemail', email: null, status: 'PENDING' })]);
    render(<BetaInvitesPage />);
    await screen.findByText('VIEWER');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' })); // trigger
    const dialog = screen.getByRole('dialog');
    // body falls back to the type when email is missing
    expect(within(dialog).getByText(/Revoke invite for VIEWER\?/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' })); // confirm
    await waitFor(() =>
      expect(adminPost).toHaveBeenCalledWith('/admin/beta-invites/inv-noemail/revoke')
    );
  });

  it('does not revoke when the dialog is cancelled', async () => {
    vi.mocked(adminGet).mockResolvedValue([invite({ status: 'PENDING' })]);
    render(<BetaInvitesPage />);
    await screen.findByText('invitee@example.com');

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' })); // trigger
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })); // cancel
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(adminPost).not.toHaveBeenCalled();
  });
});
