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
  Pagination,
  pageWindow,
  PriorityBadge,
  PromptDialog,
  QuickActions,
  RoomCell,
  SidebarGroup,
  SystemStatus,
  StatusBadge,
  SuccessBanner,
  TicketThread,
  UserCell,
  WarningBanner
} from '../app/admin-ui';

describe('pageWindow', () => {
  it('lists every page when the count is small', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('elides a run on the right when near the start', () => {
    expect(pageWindow(1, 25)).toEqual([1, 2, 3, 4, 5, null, 25]);
  });

  it('elides a run on the left when near the end', () => {
    expect(pageWindow(25, 25)).toEqual([1, null, 21, 22, 23, 24, 25]);
  });

  it('elides both sides in the middle and keeps a fixed width', () => {
    expect(pageWindow(12, 25)).toEqual([1, null, 11, 12, 13, null, 25]);
    // the control never grows past first + gap + window + gap + last
    for (let p = 1; p <= 25; p++) expect(pageWindow(p, 25).length).toBeLessThanOrEqual(7);
  });

  it('always includes the first and last page', () => {
    for (const p of [1, 5, 13, 25]) {
      const w = pageWindow(p, 25);
      expect(w[0]).toBe(1);
      expect(w[w.length - 1]).toBe(25);
    }
  });
});

describe('Pagination', () => {
  it('renders nothing when there is nothing to page', () => {
    const { container } = render(<Pagination page={1} pageSize={10} total={0} onPage={() => {}} />);
    expect(container.querySelector('.pagination')).toBeNull();
  });

  it('reports the visible range and clamps the last page', () => {
    render(<Pagination page={3} pageSize={10} total={25} onPage={() => {}} noun="rooms" />);
    // page 3 of 25 rows is 21-25, not 21-30
    expect(screen.getByText('Showing 21 to 25 of 25 rooms')).toBeInTheDocument();
  });

  it('disables prev on the first page and next on the last', () => {
    const first = render(<Pagination page={1} pageSize={10} total={30} onPage={() => {}} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeEnabled();
    first.unmount();

    render(<Pagination page={3} pageSize={10} total={30} onPage={() => {}} />);
    expect(screen.getByLabelText('Previous page')).toBeEnabled();
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('emits the requested page and marks the current one', () => {
    const onPage = vi.fn();
    const { container } = render(<Pagination page={2} pageSize={10} total={50} onPage={onPage} />);
    expect(container.querySelector('.pager-btn.on')?.textContent).toBe('2');
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('2');

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(onPage).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(onPage).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(onPage).toHaveBeenCalledWith(4);
  });
});

describe('AdminShell', () => {
  it('renders children inside a shell', () => {
    render(<AdminShell><span>shell-child</span></AdminShell>);
    expect(screen.getByText('shell-child')).toBeInTheDocument();
  });
});

describe('SidebarGroup badges', () => {
  it('renders a badge only for a positive count and caps it at 99+', () => {
    const { container } = render(
      <SidebarGroup
        heading="Nav"
        pathname="/reports"
        links={[['Reports', '/reports'], ['Payouts', '/payouts'], ['Users', '/users']]}
        badges={{ '/reports': 7, '/payouts': 0, '/users': 250 }}
      />
    );
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('99+')).toBeInTheDocument();
    // zero and unlisted routes get no badge -> exactly two badges rendered
    expect(container.querySelectorAll('.nav-badge')).toHaveLength(2);
  });

  it('renders no badges when the badges map is omitted', () => {
    const { container } = render(
      <SidebarGroup heading="Nav" pathname="/x" links={[['Reports', '/reports']]} />
    );
    expect(container.querySelectorAll('.nav-badge')).toHaveLength(0);
  });
});

describe('SystemStatus', () => {
  it('never claims "operational" before the probe answers', () => {
    const { container } = render(<SystemStatus ok={null} environment="Staging" />);
    expect(screen.getByText(/Checking…/)).toBeInTheDocument();
    expect(screen.getByText(/Staging/)).toBeInTheDocument();
    expect(container.querySelector('.system-status.pending')).not.toBeNull();
  });

  it('reports operational and degraded states', () => {
    const ok = render(<SystemStatus ok environment="Production" />);
    expect(screen.getByText(/All systems operational/)).toBeInTheDocument();
    expect(ok.container.querySelector('.system-status.ok')).not.toBeNull();
    ok.unmount();

    const bad = render(<SystemStatus ok={false} environment="Production" />);
    expect(screen.getByText(/Degraded — needs review/)).toBeInTheDocument();
    expect(bad.container.querySelector('.system-status.bad')).not.toBeNull();
  });
});

describe('QuickActions', () => {
  it('renders one toned link per action', () => {
    const { container } = render(
      <QuickActions
        actions={[
          { label: 'Approve creators', href: '/creators', tone: 'teal', icon: <span>i1</span> },
          { label: 'Suspend a room', href: '/live-rooms', tone: 'danger', icon: <span>i2</span> }
        ]}
      />
    );
    expect(container.querySelectorAll('.quick-action')).toHaveLength(2);
    expect(container.querySelector('.quick-action.teal')).toHaveAttribute('href', '/creators');
    expect(container.querySelector('.quick-action.danger')).toHaveAttribute('href', '/live-rooms');
    expect(screen.getByText('Approve creators')).toBeInTheDocument();
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
    expect(container.querySelector('.metric-card-foot')).toBeNull();
  });

  it('defaults to the gold accent and applies the requested one', () => {
    const gold = render(<MetricCard label="G" value={1} />);
    expect(gold.container.querySelector('.metric-card.accent-gold')).not.toBeNull();
    gold.unmount();

    for (const accent of ['teal', 'purple', 'danger', 'green'] as const) {
      const r = render(<MetricCard label="A" value={1} accent={accent} />);
      expect(r.container.querySelector(`.metric-card.accent-${accent}`)).not.toBeNull();
      r.unmount();
    }
  });

  it('shows a rising trend in green and a falling trend in red', () => {
    const up = render(<MetricCard label="U" value={9} trendLabel="+18.6%" trend={[1, 2, 3]} />);
    expect(up.container.querySelector('.trend-up')).not.toBeNull();
    expect(up.container.querySelector('.trend-down')).toBeNull();
    expect(up.container.querySelector('svg.metric-spark')).not.toBeNull();
    up.unmount();

    const down = render(<MetricCard label="D" value={9} trendLabel="-4.2%" trend={[3, 2, 1]} />);
    expect(down.container.querySelector('.trend-down')).not.toBeNull();
    expect(down.container.querySelector('.trend-up')).toBeNull();
  });

  it('renders a flat day as neutral, never as growth', () => {
    for (const label of ['+0.0%', '-0.0%', '0%', '0.00%']) {
      const r = render(<MetricCard label="F" value={1} trendLabel={label} />);
      expect(r.container.querySelector('.trend-flat')).not.toBeNull();
      expect(r.container.querySelector('.trend-up')).toBeNull();
      expect(r.container.querySelector('.trend-down')).toBeNull();
      r.unmount();
    }
    // a real change either side of zero still gets its direction
    const up = render(<MetricCard label="U" value={1} trendLabel="+0.1%" />);
    expect(up.container.querySelector('.trend-up')).not.toBeNull();
    up.unmount();
    const down = render(<MetricCard label="D" value={1} trendLabel="-0.1%" />);
    expect(down.container.querySelector('.trend-down')).not.toBeNull();
  });

  it('renders the foot for a bare trend and drops a too-short series', () => {
    const { container } = render(<MetricCard label="T" value={1} trend={[5]} />);
    // foot exists (trend was supplied) but MiniSparkline bails on <2 points
    expect(container.querySelector('.metric-card-foot')).not.toBeNull();
    expect(container.querySelector('small')).toBeNull();
    expect(container.querySelector('svg.metric-spark')).toBeNull();
  });
});

describe('AlertCard', () => {
  it('renders an alert link', () => {
    const { container } = render(
      <AlertCard tone="danger" title="Crit" value={3} note="needs review" href="/x" action="Review" />
    );
    expect(container.querySelector('a.alert-card.danger')).toHaveAttribute('href', '/x');
    expect(screen.getByText('Crit')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    // value and note share one line: "3 · needs review"
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/needs review/)).toBeInTheDocument();
    // no icon supplied -> falls back to the tone dot
    expect(container.querySelector('.alert-dot')).not.toBeNull();
  });

  it('renders the supplied icon instead of the tone dot', () => {
    const { container } = render(
      <AlertCard tone="good" title="OK" value="Balanced" note="reconciled" href="/y" action="View" icon={<svg data-testid="ic" />} />
    );
    expect(container.querySelector('.alert-icon')).not.toBeNull();
    expect(container.querySelector('.alert-dot')).toBeNull();
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
