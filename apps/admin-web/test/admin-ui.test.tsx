import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ActionMenu,
  AdminShell,
  AlertCard,
  AuditTimeline,
  ConfirmDialog,
  DangerBanner,
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LedgerIntegrityPanel,
  LoadingState,
  MetricCard,
  MoneyAmount,
  PageHeader,
  PayoutActionPanel,
  PriorityBadge,
  RoomCell,
  SidebarGroup,
  StatusBadge,
  SuccessBanner,
  TicketThread,
  UserCell,
  WarningBanner
} from '../app/admin-ui';

describe('AdminShell', () => {
  it('renders children inside a shell', () => {
    render(<AdminShell><span>shell-child</span></AdminShell>);
    expect(screen.getByText('shell-child')).toBeInTheDocument();
  });
});

describe('SidebarGroup', () => {
  it('marks the matching link active, renders icon and icon-less links', () => {
    const { container } = render(
      <SidebarGroup
        heading="Nav"
        pathname="/users"
        links={[
          ['Users', '/users', <span key="i">icon</span>],
          ['Rooms', '/rooms']
        ]}
      />
    );
    expect(screen.getByText('Nav')).toBeInTheDocument();
    const active = container.querySelector('a.active');
    expect(active).not.toBeNull();
    expect(active).toHaveAttribute('href', '/users');
    // with-icon link renders the nav-icon span
    expect(container.querySelector('.nav-icon')).not.toBeNull();
    // inactive link (no icon) has no nav-icon and no active class
    const rooms = screen.getByText('Rooms').closest('a');
    expect(rooms).not.toHaveClass('active');
  });
});

describe('PageHeader', () => {
  it('renders with an action node', () => {
    render(<PageHeader title="T" kicker="K" action={<button>Go</button>} />);
    expect(screen.getByText('T')).toBeInTheDocument();
    expect(screen.getByText('K')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('renders without an action node', () => {
    render(<PageHeader title="NoAction" kicker="K2" />);
    expect(screen.getByText('NoAction')).toBeInTheDocument();
  });
});

describe('MetricCard', () => {
  it('renders with tone, delta and icon', () => {
    const { container } = render(
      <MetricCard label="L" value={5} tone="warn" delta="up" icon={<span>ic</span>} />
    );
    expect(container.querySelector('.metric-card.warn')).not.toBeNull();
    expect(screen.getByText('up')).toBeInTheDocument();
    expect(container.querySelector('.metric-icon')).not.toBeNull();
  });

  it('falls back to neutral tone and omits delta/icon when absent', () => {
    const { container } = render(<MetricCard label="L2" value="x" />);
    expect(container.querySelector('.metric-card.neutral')).not.toBeNull();
    expect(container.querySelector('small')).toBeNull();
    expect(container.querySelector('.metric-icon')).toBeNull();
  });
});

describe('AlertCard', () => {
  it('renders an alert link', () => {
    const { container } = render(
      <AlertCard tone="danger" title="Crit" value={3} note="needs review" href="/x" action="Review" />
    );
    expect(container.querySelector('a.alert-card.danger')).toHaveAttribute('href', '/x');
    expect(screen.getByText('Crit')).toBeInTheDocument();
    expect(screen.getByText('Review →')).toBeInTheDocument();
    expect(screen.getByText('needs review')).toBeInTheDocument();
  });
});

describe('Banners', () => {
  it('renders the three banner variants', () => {
    const { container } = render(
      <div>
        <DangerBanner>bad</DangerBanner>
        <WarningBanner>warn</WarningBanner>
        <SuccessBanner>ok</SuccessBanner>
      </div>
    );
    expect(container.querySelector('.banner-bad')).toHaveTextContent('bad');
    expect(container.querySelector('.banner-warn')).toHaveTextContent('warn');
    expect(container.querySelector('.banner-ok')).toHaveTextContent('ok');
  });
});

describe('DataTable', () => {
  it('renders rows when children are present', () => {
    render(
      <DataTable columns={['A', 'B']}>
        <tr><td>r1</td><td>r2</td></tr>
      </DataTable>
    );
    expect(screen.getByText('r1')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders the default empty message when there are no rows', () => {
    render(<DataTable columns={['A']}>{[]}</DataTable>);
    expect(screen.getByText('No records.')).toBeInTheDocument();
  });

  it('renders a custom empty node when provided', () => {
    render(<DataTable columns={['A']} empty={<span>Nothing here</span>}>{[]}</DataTable>);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('fires onSubmit when the form is submitted', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const { container } = render(
      <FilterBar onSubmit={onSubmit}><button type="submit">go</button></FilterBar>
    );
    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalled();
  });

  it('renders without an onSubmit handler', () => {
    const { container } = render(<FilterBar><span>kid</span></FilterBar>);
    expect(container.querySelector('form.toolbar')).not.toBeNull();
  });
});

describe('StatusBadge / toneFor', () => {
  it('maps statuses to success, danger, warning and pending tones', () => {
    const { container } = render(
      <div>
        <StatusBadge status="LIVE" />
        <StatusBadge status="FAILED" />
        <StatusBadge status="PENDING" />
        <StatusBadge status="WEIRD" />
      </div>
    );
    expect(container.querySelector('.pill.success')).toHaveTextContent('LIVE');
    expect(container.querySelector('.pill.danger')).toHaveTextContent('FAILED');
    expect(container.querySelector('.pill.warning')).toHaveTextContent('PENDING');
    expect(container.querySelector('.pill.pending')).toHaveTextContent('WEIRD');
  });
});

describe('PriorityBadge', () => {
  it('maps CRITICAL, HIGH and other priorities', () => {
    const { container } = render(
      <div>
        <PriorityBadge priority="CRITICAL" />
        <PriorityBadge priority="HIGH" />
        <PriorityBadge priority="LOW" />
      </div>
    );
    expect(container.querySelector('.pill.critical')).toHaveTextContent('CRITICAL');
    expect(container.querySelector('.pill.warning')).toHaveTextContent('HIGH');
    expect(container.querySelector('.pill.pending')).toHaveTextContent('LOW');
  });
});

describe('UserCell', () => {
  it('renders with a name', () => {
    render(<UserCell name="Ada" sub="abcdefghij" />);
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('abcdefgh')).toBeInTheDocument();
  });

  it('uses the sub slice when name is null', () => {
    // name (strong) and sub (small) both render the 8-char slice
    render(<UserCell name={null} sub="0123456789" />);
    expect(screen.getAllByText('01234567')).toHaveLength(2);
    expect(screen.getByText('0')).toBeInTheDocument(); // avatar initial
  });

  it('falls back to Unknown user and A avatar when neither is present', () => {
    render(<UserCell />);
    expect(screen.getByText('Unknown user')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
  });
});

describe('RoomCell', () => {
  it('renders with title and sub', () => {
    render(<RoomCell title="Main" sub="subtitle" />);
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('subtitle')).toBeInTheDocument();
  });

  it('falls back to Untitled room and omits sub when absent', () => {
    render(<RoomCell />);
    expect(screen.getByText('Untitled room')).toBeInTheDocument();
  });
});

describe('MoneyAmount', () => {
  it('formats minor units into a currency amount', () => {
    render(<MoneyAmount minor={12345} currency="USD" />);
    expect(screen.getByText('123.45 USD')).toBeInTheDocument();
  });
});

describe('ConfirmDialog', () => {
  it('calls onConfirm when the user confirms', () => {
    const onConfirm = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ConfirmDialog title="T" body="B" confirmLabel="Yes" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not call onConfirm when the user cancels', () => {
    const onConfirm = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ConfirmDialog title="T" body="B" confirmLabel="No" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders disabled', () => {
    render(<ConfirmDialog title="T" body="B" confirmLabel="Off" onConfirm={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });
});

describe('ActionMenu', () => {
  it('renders its children', () => {
    render(<ActionMenu><span>menu-item</span></ActionMenu>);
    expect(screen.getByText('menu-item')).toBeInTheDocument();
  });
});

describe('EmptyState / ErrorState / LoadingState', () => {
  it('renders EmptyState children', () => {
    render(<EmptyState><span>nothing</span></EmptyState>);
    expect(screen.getByText('nothing')).toBeInTheDocument();
  });

  it('renders ErrorState message', () => {
    render(<ErrorState error="boom" />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders LoadingState with the default and a custom label', () => {
    const { rerender } = render(<LoadingState />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    rerender(<LoadingState label="Please wait" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
  });
});

describe('AuditTimeline', () => {
  it('renders rows, using actorId slice and the system fallback', () => {
    render(
      <AuditTimeline
        rows={[
          { action: 'a.with-actor', actorId: '0123456789', createdAt: new Date().toISOString() },
          { action: 'b.no-actor', createdAt: new Date().toISOString() }
        ]}
      />
    );
    expect(screen.getByText('a.with-actor')).toBeInTheDocument();
    expect(screen.getByText(/01234567/)).toBeInTheDocument();
    expect(screen.getByText(/system/)).toBeInTheDocument();
  });

  it('shows an empty message for no rows', () => {
    render(<AuditTimeline rows={[]} />);
    expect(screen.getByText('No recent audit events.')).toBeInTheDocument();
  });
});

describe('TicketThread', () => {
  it('renders the subject and a requester slice', () => {
    render(<TicketThread subject="Help" requester="0123456789" />);
    expect(screen.getByText('Help')).toBeInTheDocument();
    expect(screen.getByText('Requester: 01234567')).toBeInTheDocument();
  });
});

describe('LedgerIntegrityPanel', () => {
  it('renders the balanced state', () => {
    const { container } = render(<LedgerIntegrityPanel ok unbalanced={0} />);
    expect(container.querySelector('.integrity-panel.ok')).not.toBeNull();
    expect(screen.getByText('Ledger balanced')).toBeInTheDocument();
  });

  it('renders the imbalanced state', () => {
    const { container } = render(<LedgerIntegrityPanel ok={false} unbalanced={4} />);
    expect(container.querySelector('.integrity-panel.bad')).not.toBeNull();
    expect(screen.getByText('Ledger imbalance detected')).toBeInTheDocument();
    expect(screen.getByText(/4 transaction\(s\) do not balance/)).toBeInTheDocument();
  });
});

describe('PayoutActionPanel', () => {
  it('renders the blocked state', () => {
    const { container } = render(<PayoutActionPanel blocked />);
    expect(container.querySelector('.side-panel.risk')).not.toBeNull();
    expect(screen.getByText(/Approvals should remain blocked/)).toBeInTheDocument();
  });

  it('renders the unblocked state', () => {
    const { container } = render(<PayoutActionPanel blocked={false} />);
    expect(container.querySelector('.side-panel.risk')).toBeNull();
    expect(screen.getByText(/Approvals require confirmation/)).toBeInTheDocument();
  });
});
