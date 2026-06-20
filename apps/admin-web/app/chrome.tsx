'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminLogout } from '../lib/api';
import { AdminShell, SidebarGroup } from './admin-ui';

const navGroups: { heading: string; links: [string, string][] }[] = [
  {
    heading: 'Operations',
    links: [
      ['Dashboard', '/'],
      ['Beta Ops', '/beta-ops'],
      ['Live Rooms', '/live-rooms'],
      ['Reports', '/reports'],
      ['Support', '/support']
    ]
  },
  {
    heading: 'People',
    links: [
      ['Users', '/users'],
      ['Creators', '/creators'],
      ['Waitlist', '/beta-requests'],
      ['Beta Invites', '/beta-invites']
    ]
  },
  {
    heading: 'Money',
    links: [
      ['Payouts', '/payouts'],
      ['Payments', '/payments'],
      ['Ledger', '/ledger'],
      ['Ledger Integrity', '/ledger-integrity'],
      ['Gifts', '/gifts']
    ]
  },
  {
    heading: 'System',
    links: [
      ['Fraud', '/fraud'],
      ['Audit Logs', '/audit-logs']
    ]
  }
];

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;

  return (
    <AdminShell>
      <aside className="sidebar" aria-label="Admin navigation">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>
            <strong className="brand-title">AfriStage</strong>
            <span className="brand-subtitle">Mission control</span>
          </span>
        </Link>
        <nav>
          {navGroups.map((group) => (
            <SidebarGroup key={group.heading} heading={group.heading} links={group.links} pathname={pathname} />
          ))}
        </nav>
        <button className="button secondary logout" onClick={adminLogout}>
          Log out
        </button>
      </aside>
      <main className="main">{children}</main>
    </AdminShell>
  );
}
