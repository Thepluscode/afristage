'use client';

import { Children, useEffect, useState } from 'react';
import Link from 'next/link';

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}

export function SidebarGroup({
  heading,
  links,
  pathname
}: {
  heading: string;
  links: [string, string, React.ReactNode?][];
  pathname: string;
}) {
  return (
    <div className="nav-group">
      <div className="nav-heading">{heading}</div>
      {links.map(([label, href, icon]) => (
        <Link key={href} href={href} className={pathname === href ? 'active' : ''}>
          {icon ? <span className="nav-icon">{icon}</span> : null}
          {label}
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

export function MetricCard({
  label,
  value,
  tone,
  delta,
  icon
}: {
  label: string;
  value: string | number;
  tone?: 'good' | 'warn' | 'danger' | 'neutral';
  delta?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={`metric-card ${tone ?? 'neutral'}`}>
      <div className="metric-card-head">
        <span>{label}</span>
        {icon ? <span className="metric-icon">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {delta ? <small>{delta}</small> : null}
    </div>
  );
}

export function AlertCard({
  tone,
  title,
  value,
  note,
  href,
  action
}: {
  tone: 'danger' | 'warn' | 'good';
  title: string;
  value: string | number;
  note: string;
  href: string;
  action: string;
}) {
  return (
    <a className={`alert-card ${tone}`} href={href}>
      <div className="alert-card-head">
        <span className="alert-dot" />
        <span className="alert-title">{title}</span>
        <span className="alert-action">{action} →</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </a>
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
      <span className="room-dot">●</span>
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
