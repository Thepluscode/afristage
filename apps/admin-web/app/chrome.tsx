'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  CreditCard,
  Gift,
  HeartHandshake,
  Home,
  KeyRound,
  Landmark,
  ListChecks,
  LogOut,
  Menu,
  MonitorPlay,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  UserCog,
  Users
} from 'lucide-react';
import { adminLogout } from '../lib/api';
import { AdminShell, SidebarGroup } from './admin-ui';

const iconSize = 16;

const navGroups: { heading: string; links: [string, string, React.ReactNode][] }[] = [
  {
    heading: 'Operations',
    links: [
      ['Dashboard', '/', <Home key="dashboard" size={iconSize} />],
      ['Analytics', '/analytics', <BarChart3 key="analytics" size={iconSize} />],
      ['Beta Ops', '/beta-ops', <ListChecks key="beta-ops" size={iconSize} />],
      ['Live Rooms', '/live-rooms', <MonitorPlay key="live-rooms" size={iconSize} />],
      ['Reports', '/reports', <ShieldAlert key="reports" size={iconSize} />],
      ['Support', '/support', <HeartHandshake key="support" size={iconSize} />]
    ]
  },
  {
    heading: 'People',
    links: [
      ['Users', '/users', <Users key="users" size={iconSize} />],
      ['Creators', '/creators', <UserCheck key="creators" size={iconSize} />],
      ['Waitlist', '/beta-requests', <ClipboardList key="waitlist" size={iconSize} />],
      ['Beta Invites', '/beta-invites', <KeyRound key="beta-invites" size={iconSize} />]
    ]
  },
  {
    heading: 'Money',
    links: [
      ['Payouts', '/payouts', <Landmark key="payouts" size={iconSize} />],
      ['Payments', '/payments', <CreditCard key="payments" size={iconSize} />],
      ['Ledger', '/ledger', <CalendarClock key="ledger" size={iconSize} />],
      ['Ledger Integrity', '/ledger-integrity', <ShieldCheck key="ledger-integrity" size={iconSize} />],
      ['Gifts', '/gifts', <Gift key="gifts" size={iconSize} />]
    ]
  },
  {
    heading: 'System',
    links: [
      ['Fraud', '/fraud', <ShieldAlert key="fraud" size={iconSize} />],
      ['Audit Logs', '/audit-logs', <ClipboardList key="audit-logs" size={iconSize} />],
      ['Security', '/security', <UserCog key="security" size={iconSize} />]
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
          <span className="brand-mark" aria-hidden="true"><Sparkles size={24} /></span>
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
          <LogOut size={16} />
          Log out
        </button>
      </aside>
      <main className="main">
        <div className="topbar">
          <button className="icon-button" type="button" aria-label="Open navigation"><Menu size={18} /></button>
          <strong>Mission control</strong>
          <label className="global-search">
            <span>Search</span>
            <Search size={16} aria-hidden="true" />
            <input placeholder="Search users, rooms, payouts, reports..." />
          </label>
          <button className="icon-button" type="button" aria-label="Toggle theme"><Sun size={18} /></button>
          <button className="icon-button with-badge" type="button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="admin-menu" type="button">
            <span className="admin-avatar">AO</span>
            <span>
              <strong>Super Admin</strong>
              <small>Admin Operator</small>
            </span>
            <ChevronDown aria-hidden="true" className="admin-caret" size={16} />
          </button>
        </div>
        {children}
      </main>
    </AdminShell>
  );
}
