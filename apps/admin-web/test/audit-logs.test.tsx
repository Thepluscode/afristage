import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/api', () => ({ adminGet: vi.fn(), adminPost: vi.fn(), adminPatch: vi.fn(), adminLogout: vi.fn() }));
import { adminGet } from '../lib/api';
import AuditLogsPage from '../app/audit-logs/page';

afterEach(() => vi.clearAllMocks());

describe('AuditLogsPage', () => {
  it('renders error state', async () => {
    vi.mocked(adminGet).mockRejectedValue(new Error('audit-boom'));
    render(<AuditLogsPage />);
    expect(await screen.findByText('audit-boom')).toBeInTheDocument();
  });

  it('empty data -> empty state and AuditTimeline empty message', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    render(<AuditLogsPage />);
    expect(await screen.findByText('No audit logs yet.')).toBeInTheDocument();
    expect(screen.getByText('No recent audit events.')).toBeInTheDocument();
  });

  it('renders rows: target present/absent, metadata present/absent', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      {
        id: 'log1',
        actorId: 'actor-aaaaaaaa1111',
        action: 'payout.approve',
        target: 'target-id-1',
        metadata: { a: 1 },
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'log2',
        actorId: 'actor-bbbbbbbb2222',
        action: 'login',
        // no target -> '—' for both target columns; metadata undefined -> empty code
        createdAt: '2024-01-02T00:00:00Z'
      }
    ]);
    render(<AuditLogsPage />);
    // action appears in the table pill AND in the AuditTimeline side panel
    expect((await screen.findAllByText('payout.approve')).length).toBeGreaterThan(0);
    expect(screen.getByText('target-id-1')).toBeInTheDocument();
    expect(screen.getByText('payout')).toBeInTheDocument(); // target type = action.split('.')[0]
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
    expect(screen.getAllByText('login').length).toBeGreaterThan(0);
  });

  it('covers action.split fallback "target" when split[0] is empty', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      { id: 'l', actorId: 'x', action: '.leadingdot', target: 't', createdAt: '2024-01-01T00:00:00Z' }
    ]);
    render(<AuditLogsPage />);
    // action '.leadingdot'.split('.')[0] === '' -> falls back to 'target'
    expect((await screen.findAllByText('target')).length).toBeGreaterThan(0);
  });

  it('filters by actor and action (case-insensitive)', async () => {
    vi.mocked(adminGet).mockResolvedValue([
      { id: 'a', actorId: 'alice-123', action: 'PAYOUT.HOLD', target: 'KEEP', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'b', actorId: 'bob-456', action: 'login', target: 'DROP', createdAt: '2024-01-01T00:00:00Z' }
    ]);
    render(<AuditLogsPage />);
    await screen.findByText('KEEP');
    const [actorInput, actionInput] = screen.getAllByRole('textbox');
    fireEvent.change(actorInput, { target: { value: 'alice' } });
    await waitFor(() => expect(screen.queryByText('DROP')).not.toBeInTheDocument());
    expect(screen.getByText('KEEP')).toBeInTheDocument();
    fireEvent.change(actorInput, { target: { value: '' } });
    fireEvent.change(actionInput, { target: { value: 'login' } });
    await waitFor(() => expect(screen.queryByText('KEEP')).not.toBeInTheDocument());
    expect(screen.getByText('DROP')).toBeInTheDocument();
  });

  it('filter bar submit is prevented', async () => {
    vi.mocked(adminGet).mockResolvedValue([]);
    const { container } = render(<AuditLogsPage />);
    await screen.findByText('No audit logs yet.');
    fireEvent.submit(container.querySelector('form.toolbar') as HTMLFormElement);
  });
});
