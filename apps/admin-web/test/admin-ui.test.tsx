import { fireEvent, render, screen, within } from '@testing-library/react';
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
  Modal,
  MoneyAmount,
  PageHeader,
  PayoutActionPanel,
  PriorityBadge,
  PromptDialog,
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

describe('Modal', () => {
  it('closes on Escape and on overlay click, but not on inner click', () => {
    const onClose = vi.fn();
    const { container, unmount } = render(
      <Modal title="M" onClose={onClose}>
        <span>inner</span>
      </Modal>
    );
    // click inside the modal panel does not close (stopPropagation)
    fireEvent.click(screen.getByText('inner'));
    expect(onClose).not.toHaveBeenCalled();
    // Escape closes
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    // a non-Escape key is ignored
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(1);
    // overlay (presentation) click closes
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(2);
    // keydown listener is removed on unmount (no further calls)
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ConfirmDialog', () => {
  it('opens a modal and calls onConfirm on confirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" body="B" confirmLabel="Yes" onConfirm={onConfirm} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' })); // trigger (falls back to confirmLabel)
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('B')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull(); // closed after confirm
  });

  it('uses triggerLabel for the trigger when provided and cancels without calling onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" body="B" confirmLabel="Approve" triggerLabel="Approve Payout" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve Payout' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes via the Modal (Escape) without confirming', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" body="B" confirmLabel="Yes" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders the trigger disabled', () => {
    render(<ConfirmDialog title="T" body="B" confirmLabel="Off" onConfirm={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  });
});

describe('PromptDialog', () => {
  it('collects a value, submits trimmed, and resets to defaultValue on reopen', () => {
    const onSubmit = vi.fn();
    render(
      <PromptDialog triggerLabel="Edit" title="Edit price" body="Set price" inputLabel="Coins" defaultValue="10" confirmLabel="Save" onSubmit={onSubmit} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Set price')).toBeInTheDocument();
    const input = within(dialog).getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('10');
    fireEvent.change(input, { target: { value: '  42  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith('42'); // trimmed
    // reopen resets to defaultValue
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((within(screen.getByRole('dialog')).getByRole('textbox') as HTMLInputElement).value).toBe('10');
  });

  it('submits on Enter and renders a danger trigger with no body', () => {
    const onSubmit = vi.fn();
    render(<PromptDialog triggerLabel="Reject" title="Reject" inputLabel="Reason" confirmLabel="Reject" danger onSubmit={onSubmit} />);
    const trigger = screen.getByRole('button', { name: 'Reject' });
    expect(trigger.className).toContain('danger');
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Reason', { selector: 'p' })).toBeNull(); // no body paragraph
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith(''); // empty allowed when not required
  });

  it('keeps confirm disabled until a required value is entered', () => {
    const onSubmit = vi.fn();
    render(<PromptDialog triggerLabel="Mark Paid" title="Mark paid" inputLabel="Reference" confirmLabel="Mark Paid" required triggerClassName="button" onSubmit={onSubmit} />);
    const trigger = screen.getByRole('button', { name: 'Mark Paid' });
    expect(trigger.className).toBe('button'); // explicit triggerClassName wins
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Mark Paid' });
    expect(confirm).toBeDisabled();
    // Enter with empty required value is a no-op
    fireEvent.keyDown(within(dialog).getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'TX-1' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith('TX-1');
  });

  it('cancels without submitting and renders a secondary trigger by default', () => {
    const onSubmit = vi.fn();
    render(<PromptDialog triggerLabel="Hold" title="Hold" inputLabel="Reason" confirmLabel="Hold" onSubmit={onSubmit} />);
    const trigger = screen.getByRole('button', { name: 'Hold' });
    expect(trigger.className).toContain('secondary');
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes via the Modal (overlay click) without submitting', () => {
    const onSubmit = vi.fn();
    const { container } = render(<PromptDialog triggerLabel="Hold" title="Hold" inputLabel="Reason" confirmLabel="Hold" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    fireEvent.click(container.querySelector('.modal-overlay')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the trigger disabled', () => {
    render(<PromptDialog triggerLabel="Nope" title="T" inputLabel="R" confirmLabel="Go" onSubmit={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
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
