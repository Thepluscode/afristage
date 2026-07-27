'use client';

import { Children, useEffect, useState } from 'react';
import Link from 'next/link';
import { MiniSparkline } from './Sparkline';

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}

export function SidebarGroup({
  heading,
  links,
  pathname,
  badges
}: {
  heading: string;
  links: [string, string, React.ReactNode?][];
  pathname: string;
  /** Route -> pending-work count. A zero or missing count renders no badge. */
  badges?: Record<string, number>;
}) {
  return (
    <div className="nav-group">
      <div className="nav-heading">{heading}</div>
      {links.map(([label, href, icon]) => {
        const count = badges?.[href] ?? 0;
        return (
          <Link key={href} href={href} className={pathname === href ? 'active' : ''}>
            {icon ? <span className="nav-icon">{icon}</span> : null}
            {label}
            {count > 0 ? (
              <span className="nav-badge" aria-label={`${count} awaiting`}>{count > 99 ? '99+' : count}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/// Sidebar footer heartbeat. `ok === null` means the probe has not answered yet,
/// which must not read as "healthy".
export function SystemStatus({ ok, environment }: { ok: boolean | null; environment: string }) {
  const state = ok === null ? 'pending' : ok ? 'ok' : 'bad';
  return (
    <div className={`system-status ${state}`}>
      <span className="system-dot" aria-hidden="true" />
      <span>
        <strong>System status</strong>
        <small>
          {ok === null ? 'Checking…' : ok ? 'All systems operational' : 'Degraded — needs review'}
          {' · '}
          {environment}
        </small>
      </span>
    </div>
  );
}

export function QuickActions({ actions }: { actions: { label: string; href: string; tone: 'teal' | 'danger' | 'gold' | 'purple'; icon: React.ReactNode }[] }) {
  return (
    <div className="quick-actions">
      {actions.map((a) => (
        <Link key={a.href + a.label} className={`quick-action ${a.tone}`} href={a.href}>
          <span className="quick-action-icon">{a.icon}</span>
          <span className="quick-action-label">{a.label}</span>
          <span className="quick-action-arrow" aria-hidden="true">→</span>
        </Link>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  kicker,
  action
}: {
  title: string;
  kicker: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h2>{title}</h2>
        <p className="page-kicker">{kicker}</p>
      </div>
      {action}
    </header>
  );
}

const ACCENT_HEX: Record<MetricAccent, string> = {
  teal: '#14b8a6',
  purple: '#a78bfa',
  gold: '#ffc857',
  danger: '#ef4444',
  green: '#22c55e'
};

export type MetricAccent = 'teal' | 'purple' | 'gold' | 'danger' | 'green';

export function MetricCard({
  label,
  value,
  tone,
  delta,
  icon,
  accent = 'gold',
  trend,
  trendLabel
}: {
  label: string;
  value: string | number;
  tone?: 'good' | 'warn' | 'danger' | 'neutral';
  /** Caption under the value. Prefixed with an arrow when `trendLabel` is set. */
  delta?: string;
  icon?: React.ReactNode;
  accent?: MetricAccent;
  /** Series for the in-card area micro-chart. Fewer than 2 points renders nothing. */
  trend?: number[];
  /** Signed change, e.g. `+18.6%`. Sign drives the up/down colour. */
  trendLabel?: string;
}) {
  // A flat day reads as neither up nor down — a green ▲ on +0.0% claims growth
  // that did not happen.
  const flat = trendLabel != null && /^[+-]?0(\.0+)?%$/.test(trendLabel);
  const down = !flat && (trendLabel?.startsWith('-') ?? false);
  const trendClass = flat ? 'trend-flat' : down ? 'trend-down' : 'trend-up';
  const trendArrow = flat ? '▬' : down ? '▼' : '▲';
  return (
    <div className={`metric-card ${tone ?? 'neutral'} accent-${accent}`}>
      <div className="metric-card-head">
        {icon ? <span className="metric-icon">{icon}</span> : null}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {delta || trendLabel || trend ? (
        <div className="metric-card-foot">
          {delta || trendLabel ? (
            <small>
              {trendLabel ? <em className={trendClass}>{trendArrow} {trendLabel}</em> : null}
              {delta ? <span>{delta}</span> : null}
            </small>
          ) : null}
          {trend ? <MiniSparkline values={trend} accent={ACCENT_HEX[accent]} /> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AlertCard({
  tone,
  title,
  value,
  note,
  href,
  action,
  icon
}: {
  tone: 'danger' | 'warn' | 'good';
  title: string;
  value: string | number;
  note: string;
  href: string;
  action: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link className={`alert-card ${tone}`} href={href}>
      {icon ? <span className="alert-icon">{icon}</span> : <span className="alert-dot" />}
      <span className="alert-body">
        <span className="alert-title">{title}</span>
        <span className="alert-note">
          <strong>{value}</strong> · {note}
        </span>
      </span>
      <span className="alert-action">{action}</span>
    </Link>
  );
}

function Banner({
  className,
  children
}: {
  className: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}

export const DangerBanner = ({ children }: { children: React.ReactNode }) => (
  <Banner className="banner-bad">{children}</Banner>
);
export const WarningBanner = ({ children }: { children: React.ReactNode }) => (
  <Banner className="banner-warn">{children}</Banner>
);
export const SuccessBanner = ({ children }: { children: React.ReactNode }) => (
  <Banner className="banner-ok">{children}</Banner>
);

export function DataTable({
  columns,
  children,
  empty
}: {
  columns: string[];
  children: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const hasRows = Children.count(children) > 0;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {hasRows ? children : (
            <tr>
              <td colSpan={columns.length}>{empty ?? 'No records.'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ children, onSubmit }: { children: React.ReactNode; onSubmit?: React.FormEventHandler }) {
  return (
    <form className="toolbar" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`pill ${toneFor(status)}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = priority === 'CRITICAL' ? 'critical' : priority === 'HIGH' ? 'warning' : 'pending';
  return <span className={`pill ${tone}`}>{priority}</span>;
}

export function UserCell({ name, sub }: { name?: string | null; sub?: string | null }) {
  return (
    <span className="entity-cell">
      <span className="avatar-dot">{(name || sub || 'A').slice(0, 1).toUpperCase()}</span>
      <span>
        <strong>{name || sub?.slice(0, 8) || 'Unknown user'}</strong>
        {sub ? <small>{sub.slice(0, 8)}</small> : null}
      </span>
    </span>
  );
}

export function RoomCell({ title, sub }: { title?: string | null; sub?: string | null }) {
  return (
    <span className="entity-cell">
      <span className="room-dot">{(title || 'R').trim().slice(0, 1).toUpperCase()}</span>
      <span>
        <strong>{title || 'Untitled room'}</strong>
        {sub ? <small>{sub}</small> : null}
      </span>
    </span>
  );
}

export function MoneyAmount({
  minor,
  currency
}: {
  minor: string | number;
  currency: string;
}) {
  return <strong>{(Number(minor) / 100).toFixed(2)} {currency}</strong>;
}

// In-app modal — replaces native window.confirm/prompt so destructive admin
// actions get a styled, accessible dialog instead of a browser popup.
export function Modal({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  disabled = false,
  triggerLabel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="button danger" disabled={disabled} onClick={() => setOpen(true)}>
        {triggerLabel ?? confirmLabel}
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <h2 className="modal-title">{title}</h2>
          <p className="modal-body">{body}</p>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="button danger"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// Collects one value in a styled modal (replaces native prompt()). onSubmit
// receives the trimmed value; when `required`, the confirm button stays
// disabled until something is entered.
export function PromptDialog({
  triggerLabel,
  title,
  body,
  inputLabel,
  placeholder,
  defaultValue = '',
  confirmLabel,
  onSubmit,
  required = false,
  disabled = false,
  danger = false,
  triggerClassName
}: {
  triggerLabel: string;
  title: string;
  body?: string;
  inputLabel: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  danger?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const submit = () => {
    const v = value.trim();
    if (required && !v) return;
    setOpen(false);
    onSubmit(v);
  };
  return (
    <>
      <button
        className={triggerClassName ?? (danger ? 'button danger' : 'button secondary')}
        disabled={disabled}
        onClick={() => {
          setValue(defaultValue);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <h2 className="modal-title">{title}</h2>
          {body && <p className="modal-body">{body}</p>}
          <label className="modal-field">
            <span>{inputLabel}</span>
            <input
              className="modal-input"
              autoFocus
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </label>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className={danger ? 'button danger' : 'button'} disabled={required && !value.trim()} onClick={submit}>
              {confirmLabel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function ActionMenu({ children }: { children: React.ReactNode }) {
  return <div className="actions action-menu">{children}</div>;
}

/** Page numbers to render, with `null` marking an elided run.
 *  Always shows the first and last page plus a window around the current one, so
 *  the control stays a fixed width no matter how many pages exist. */
export function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, Math.min(current - 1, total - 4));
  const to = Math.min(total - 1, Math.max(current + 1, 5));
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p++) out.push(p);
  if (to < total - 1) out.push(null);
  out.push(total);
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  noun = 'results'
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const lastShown = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span className="muted">
        Showing {first} to {lastShown} of {total.toLocaleString()} {noun}
      </span>
      <nav className="pager" aria-label="Pagination">
        <button type="button" className="pager-btn" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        {pageWindow(page, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className={p === page ? 'pager-btn on' : 'pager-btn'}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          )
        )}
        <button type="button" className="pager-btn" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          ›
        </button>
      </nav>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function ErrorState({ error }: { error: string }) {
  return <p className="error">{error}</p>;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <p className="loading-state">{label}</p>;
}

export function AuditTimeline({ rows }: { rows: { action: string; actorId?: string; createdAt: string }[] }) {
  return (
    <section className="side-panel">
      <h3>Audit timeline</h3>
      <div className="timeline">
        {rows.slice(0, 6).map((r, i) => (
          <div className="timeline-item" key={`${r.action}-${i}`}>
            <span className="timeline-dot" />
            <strong>{r.action}</strong>
            <small>{r.actorId?.slice(0, 8) || 'system'} · {new Date(r.createdAt).toLocaleString()}</small>
          </div>
        ))}
        {rows.length === 0 ? <small>No recent audit events.</small> : null}
      </div>
    </section>
  );
}

export function TicketThread({ subject, requester }: { subject: string; requester: string }) {
  return (
    <section className="side-panel">
      <h3>Ticket thread</h3>
      <p><strong>{subject}</strong></p>
      <p className="muted">Requester: {requester.slice(0, 8)}</p>
      <div className="internal-note">Internal notes stay private to admins.</div>
    </section>
  );
}

export function LedgerIntegrityPanel({
  ok,
  unbalanced
}: {
  ok: boolean;
  unbalanced: number;
}) {
  return (
    <section className={`integrity-panel ${ok ? 'ok' : 'bad'}`}>
      <h3>{ok ? 'Ledger balanced' : 'Ledger imbalance detected'}</h3>
      <p>
        {ok
          ? 'No imbalanced transactions detected.'
          : `${unbalanced} transaction(s) do not balance. Disable payout approvals until resolved.`}
      </p>
    </section>
  );
}

export function PayoutActionPanel({ blocked }: { blocked: boolean }) {
  return (
    <section className={`side-panel ${blocked ? 'risk' : ''}`}>
      <h3>Payout action rules</h3>
      <p>{blocked ? 'Ledger risk detected. Approvals should remain blocked.' : 'Approvals require confirmation. Holds and rejections require reasons.'}</p>
    </section>
  );
}

function toneFor(status: string) {
  const s = status.toUpperCase();
  if (['LIVE', 'ACTIVE', 'APPROVED', 'SUCCEEDED', 'PAID', 'COMPLETED', 'BALANCED', 'RESOLVED', 'CLOSED', 'ACTIONED', 'DISMISSED'].includes(s)) return 'success';
  if (['FAILED', 'BANNED', 'SUSPENDED', 'REJECTED', 'CRITICAL'].includes(s)) return 'danger';
  if (['HELD', 'PENDING', 'UNDER_REVIEW', 'OPEN', 'IN_REVIEW', 'REVIEWING'].includes(s)) return 'warning';
  return 'pending';
}
