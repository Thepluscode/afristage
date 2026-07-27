'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardList,
  CreditCard,
  Gift,
  HeartHandshake,
  Home,
  KeyRound,
  Landmark,
  ListChecks,
  LogOut,
  MonitorPlay,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  UserCog,
  Users
} from 'lucide-react';
import { adminGet, adminLogout } from '../lib/api';
import { AdminShell, SidebarGroup, SystemStatus } from './admin-ui';
import { Topbar } from './topbar';

type NavCounts = {
  criticalReports: number;
  pendingReports: number;
  pendingPayouts: number;
  failedPayments: number;
  openSupportTickets?: number;
  pendingCreatorApprovals?: number;
};

const iconSize = 16;

const navGroups: { heading: string; links: [string, string, React.ReactNode][] }[] = [
  {
    heading: 'Operations',
    links: [
      ['Mission Control', '/', <Home key="dashboard" size={iconSize} />],
      ['Analytics', '/analytics', <BarChart3 key="analytics" size={iconSize} />],
      ['User Activity', '/user-activity', <Activity key="user-activity" size={iconSize} />],
      ['Charts', '/leaderboard', <Trophy key="charts" size={iconSize} />],
      ['Beta Ops', '/beta-ops', <ListChecks key="beta-ops" size={iconSize} />],
      ['Live Rooms', '/live-rooms', <MonitorPlay key="live-rooms" size={iconSize} />],
      ['Reports', '/reports', <ShieldAlert key="reports" size={iconSize} />],
      ['Support', '/support', <HeartHandshake key="support" size={iconSize} />],
      ['Events', '/events', <CalendarClock key="events" size={iconSize} />]
    ]
  },
  {
    heading: 'People',
    links: [
      ['Users', '/users', <Users key="users" size={iconSize} />],
      ['Creators', '/creators', <UserCheck key="creators" size={iconSize} />],
      ['Waitlist', '/beta-requests', <ClipboardList key="waitlist" size={iconSize} />],
      ['Beta Invites', '/beta-invites', <KeyRound key="beta-invites" size={iconSize} />],
      ['Circles', '/circles', <Users key="circles" size={iconSize} />],
      ['Agencies', '/agencies', <UserCheck key="agencies" size={iconSize} />]
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

// Flattened for the header quick-nav search.
const navItems = navGroups.flatMap((g) => g.links.map(([label, href]) => ({ label, href, group: g.heading })));

export function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [counts, setCounts] = useState<NavCounts | null>(null);
  // `null` = not answered yet; the footer must not claim "operational" before then.
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const chromeless = pathname === '/login' || pathname === '/site' || pathname.startsWith('/site/');

  // Auto-close the mobile drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Sidebar badges + status heartbeat. Optional decoration: a failure leaves the
  // badges off and the status "degraded" rather than breaking navigation.
  useEffect(() => {
    if (chromeless) return;
    let live = true;
    adminGet<NavCounts>('/admin/dashboard')
      .then((d) => {
        if (!live) return;
        setCounts(d);
        setHealthy(true);
      })
      .catch((e) => {
        if (!live) return;
        console.warn('Sidebar counts unavailable', e);
        setHealthy(false);
      });
    return () => {
      live = false;
    };
  }, [chromeless, pathname]);

  const badges: Record<string, number> = {
    '/reports': counts?.criticalReports ?? 0,
    '/payouts': counts?.pendingPayouts ?? 0,
    '/support': counts?.openSupportTickets ?? 0,
    '/creators': counts?.pendingCreatorApprovals ?? 0,
    '/payments': counts?.failedPayments ?? 0
  };

  if (chromeless) return <>{children}</>;

  return (
    <AdminShell>
      <aside className={navOpen ? 'sidebar open' : 'sidebar'} aria-label="Admin navigation">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"><Sparkles size={24} /></span>
          <span>
            <strong className="brand-title">AfriStage</strong>
            <span className="brand-subtitle">Mission control</span>
          </span>
        </Link>
        <nav>
          {navGroups.map((group) => (
            <SidebarGroup key={group.heading} heading={group.heading} links={group.links} pathname={pathname} badges={badges} />
          ))}
        </nav>
        <button className="button secondary logout" onClick={adminLogout}>
          <LogOut size={16} />
          Log out
        </button>
        <SystemStatus ok={healthy} environment={process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'Production'} />
      </aside>
      {navOpen && <div className="sidebar-scrim" aria-hidden="true" onClick={() => setNavOpen(false)} />}
      <main className="main">
        <Topbar onMenu={() => setNavOpen((v) => !v)} navItems={navItems} />
        {children}
      </main>
    </AdminShell>
  );
}
