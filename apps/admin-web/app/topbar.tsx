'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, ChevronDown, LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { adminGet, adminLogout, adminPost } from '../lib/api';

type NavItem = { label: string; href: string; group: string };
type Me = { sub?: string; email?: string; role?: string };
type Notif = { id: string; title: string; body?: string | null; readAt?: string | null; createdAt: string };

const THEME_KEY = 'afristage-admin-theme';
type Panel = 'search' | 'notif' | 'profile' | null;

function applyTheme(theme: 'light' | 'dark') {
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode / storage disabled — theme just won't persist */
  }
}

export function Topbar({ onMenu, navItems }: { onMenu: () => void; navItems: NavItem[] }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [query, setQuery] = useState('');
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<Notif[] | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Reflect the theme the no-FOUC script already applied to <html>.
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  // Identity + unread badge — both optional, never block the header on failure.
  useEffect(() => {
    adminGet<Me>('/auth/me').then(setMe).catch(() => {});
    adminGet<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
  }, []);

  // Close any open panel on outside click or Escape.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return next;
    });
  }

  function openNotifs() {
    if (panel === 'notif') {
      setPanel(null);
      return;
    }
    setPanel('notif');
    adminGet<Notif[]>('/notifications/me').then(setNotifs).catch(() => setNotifs([]));
  }

  async function markAllRead() {
    try {
      await adminPost('/notifications/read-all');
      setUnread(0);
      setNotifs((prev) => prev?.map((n) => ({ ...n, readAt: n.readAt ?? n.createdAt })) ?? prev);
    } catch {
      /* leave state as-is; the badge simply won't clear */
    }
  }

  const matches = query.trim()
    ? navItems.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  function go(href: string) {
    setQuery('');
    setPanel(null);
    router.push(href);
  }

  return (
    <div className="topbar" ref={root}>
      <button className="icon-button nav-toggle" type="button" aria-label="Open navigation" onClick={onMenu}>
        <Menu size={18} />
      </button>
      <strong>Mission control</strong>

      <div className="global-search">
        <label>
          <span>Search</span>
          <Search size={16} aria-hidden="true" />
          <input
            placeholder="Jump to a section…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPanel('search');
            }}
            onFocus={() => setPanel('search')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) go(matches[0].href);
            }}
          />
        </label>
        {panel === 'search' && query.trim() && (
          <div className="dropdown search-results" role="listbox">
            {matches.length ? (
              matches.map((m) => (
                <button key={m.href} type="button" role="option" aria-selected="false" onClick={() => go(m.href)}>
                  <span>{m.label}</span>
                  <small>{m.group}</small>
                </button>
              ))
            ) : (
              <p className="dropdown-empty">No section matches “{query.trim()}”.</p>
            )}
          </div>
        )}
      </div>

      <button className="icon-button" type="button" aria-label="Toggle theme" onClick={toggleTheme}>
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="menu-anchor">
        <button className="icon-button with-badge" type="button" aria-label="Notifications" onClick={openNotifs}>
          <Bell size={18} />
          {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
        </button>
        {panel === 'notif' && (
          <div className="dropdown notif-panel">
            <header>
              <strong>Notifications</strong>
              <button type="button" className="link-button" onClick={markAllRead}>
                <Check size={13} /> Mark all read
              </button>
            </header>
            {notifs === null ? (
              <p className="dropdown-empty">Loading…</p>
            ) : notifs.length === 0 ? (
              <p className="dropdown-empty">You’re all caught up.</p>
            ) : (
              <ul>
                {notifs.map((n) => (
                  <li key={n.id} className={n.readAt ? 'read' : 'unread'}>
                    <strong>{n.title}</strong>
                    {n.body ? <span>{n.body}</span> : null}
                    <small>{new Date(n.createdAt).toLocaleString()}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="menu-anchor">
        <button
          className="admin-menu"
          type="button"
          aria-haspopup="menu"
          aria-expanded={panel === 'profile'}
          onClick={() => setPanel(panel === 'profile' ? null : 'profile')}
        >
          <span className="admin-avatar">AO</span>
          <span>
            <strong>{me?.role ? me.role.replace(/_/g, ' ') : 'Admin'}</strong>
            <small>{me?.email || me?.sub || 'Admin Operator'}</small>
          </span>
          <ChevronDown aria-hidden="true" className="admin-caret" size={16} />
        </button>
        {panel === 'profile' && (
          <div className="dropdown profile-panel" role="menu">
            <p className="profile-id">
              <strong>{me?.role ? me.role.replace(/_/g, ' ') : 'Admin'}</strong>
              <small>{me?.email || me?.sub || 'Signed in'}</small>
            </p>
            <button type="button" role="menuitem" className="dropdown-item danger" onClick={adminLogout}>
              <LogOut size={15} /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
