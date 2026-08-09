"use client";

import {
  Archive,
  CaretDown,
  CaretRight,
  ClockCounterClockwise,
  FileText,
  Gear,
  House,
  ListChecks,
  MagnifyingGlass,
  Package,
  Pulse,
  SignOut,
  SidebarSimple,
  ShieldCheck,
  Users,
  X,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchMe, logout } from "@/lib/api";
import type { UserRole } from "@/lib/types";

const SIDEBAR_CHANGE_EVENT = "gateguard.sidebar.change";

const groups = [
  {
    label: "Home",
    items: [["/dashboard", "Overview", House, "operator"]],
  },
  {
    label: "Operations",
    items: [
      ["/work-queue", "Work queue", ListChecks, "operator"],
      ["/shipments", "Shipments", Package, "operator"],
      ["/reconcile", "Document checks", FileText, "operator"],
      ["/history", "Recent checks", ClockCounterClockwise, "operator"],
    ],
  },
  {
    label: "Observe",
    items: [
      ["/monitoring", "Service status", Pulse, "operator"],
      ["/audit", "Activity log", Archive, "supervisor"],
    ],
  },
  {
    label: "Manage",
    items: [["/settings", "Workspace settings", Gear, "operator"]],
  },
] as const;

function subscribeToSidebar(callback: () => void) {
  const listener = () => callback();
  window.addEventListener(SIDEBAR_CHANGE_EVENT, listener);
  return () => window.removeEventListener(SIDEBAR_CHANGE_EVENT, listener);
}

function getSidebarSnapshot() {
  return window.localStorage.getItem("gateguard.sidebar.collapsed") === "true";
}

function getSidebarServerSnapshot() {
  return false;
}

function canSee(role: UserRole, minimum: string) {
  const levels = { operator: 1, supervisor: 2, admin: 3 };
  return levels[role] >= (levels[minimum as UserRole] || 1);
}

function activeLabel(pathname: string) {
  for (const group of groups) {
    const match = group.items.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
    if (match) return match[1];
  }
  return "Overview";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const items = useMemo(
    () => groups.flatMap((group) => group.items.map(([href, label, Icon, minimum]) => ({ href, label, Icon, minimum, group: group.label }))),
    [],
  );
  const results = items.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") setSearchOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleSidebar() {
    const next = !collapsed;
    window.localStorage.setItem("gateguard.sidebar.collapsed", String(next));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  }

  function openSearch() {
    setSearch("");
    setSearchOpen(true);
  }

  async function signOut() {
    await logout();
    await client.invalidateQueries({ queryKey: ["auth", "me"] });
    router.replace("/login");
  }

  if (!user) return null;
  return (
    <div className="console-shell" data-sidebar-collapsed={collapsed}>
      <aside className="console-sidebar">
        <div className="console-sidebar__brand">
          <span className="console-brand-mark"><ShieldCheck size={20} weight="bold" /></span>
          <span className="console-brand-name">GateGuard</span>
          <Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"} title={collapsed ? "Open sidebar" : "Collapse sidebar"} className="console-sidebar__toggle" onClick={toggleSidebar} />
        </div>

        <button type="button" className="console-workspace-switcher" onClick={openSearch} aria-label="Open workspace search">
          <span className="console-context-dot" />
          <span className="console-context-copy"><strong>Operations workspace</strong><small>GateGuard account</small></span>
          <CaretDown size={14} />
        </button>

        <button type="button" className="console-search console-search--sidebar" onClick={openSearch} aria-label="Search GateGuard">
          <MagnifyingGlass size={16} /><span>Search GateGuard</span><kbd>Ctrl K</kbd>
        </button>

        <nav className="console-sidebar__nav" aria-label="GateGuard navigation">
          {groups.map((group) => {
            const visible = group.items.filter(([, , , minimum]) => canSee(user.role, minimum));
            if (!visible.length) return null;
            return <div key={group.label} className="console-nav-group">
              <div className="console-sidebar__label">{group.label}</div>
              {visible.map(([href, label, Icon]) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return <Link key={href} href={href} className={`console-nav-link ${active ? "is-active" : ""}`} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}>
                  <Icon size={17} weight={active ? "fill" : "regular"} /><span>{label}</span>{active && <span className="console-nav-link__active" />}
                </Link>;
              })}
            </div>;
          })}
          {user.role === "admin" && <div className="console-nav-group"><div className="console-sidebar__label">Administration</div><Link href="/settings/users" className={`console-nav-link ${pathname.startsWith("/settings/users") ? "is-active" : ""}`} title={collapsed ? "People" : undefined}><Users size={17} /><span>People</span></Link></div>}
        </nav>

        <div className="console-sidebar__footer">
          <div className="console-user-avatar">{user.display_name.slice(0, 1).toUpperCase()}</div>
          <div className="console-user-copy"><div className="console-user-name">{user.display_name}</div><div className="console-user-role">{user.role === "admin" ? "Administrator" : user.role === "supervisor" ? "Reviewer" : "Operator"}</div></div>
          <Button variant="ghost" shape="square" size="sm" icon={SignOut} aria-label="Sign out" title="Sign out" onClick={signOut} />
        </div>
      </aside>

      <div className="console-main">
        <header className="console-topbar">
          <div className="console-topbar__left"><Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"} title={collapsed ? "Open sidebar" : "Collapse sidebar"} className="console-mobile-toggle" onClick={toggleSidebar} /><div className="console-breadcrumb"><span>GateGuard</span><CaretRight size={14} /><strong>{activeLabel(pathname)}</strong></div></div>
          <div className="console-topbar__actions"><button type="button" className="console-search" onClick={openSearch} aria-label="Search GateGuard"><MagnifyingGlass size={16} /><span>Search</span><kbd>Ctrl K</kbd></button><div className="console-topbar__account"><span className="console-user-avatar console-user-avatar--small">{user.display_name.slice(0, 1).toUpperCase()}</span><span>{user.display_name}</span></div></div>
        </header>
        <main className="console-content">{children}</main>
      </div>

      {searchOpen && <div className="command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <div className="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title">
          <div className="command-dialog__header"><MagnifyingGlass size={18} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages" aria-label="Search pages" /><Button variant="ghost" shape="square" size="sm" icon={X} aria-label="Close search" onClick={() => setSearchOpen(false)} /></div>
          <div className="command-dialog__hint" id="command-title">Navigate GateGuard <span>Esc to close</span></div>
          <div className="command-dialog__results">{results.filter((item) => canSee(user.role, item.minimum)).map((item) => <button type="button" key={item.href} className="command-result" onClick={() => { setSearchOpen(false); router.push(item.href); }}><item.Icon size={17} /><span><strong>{item.label}</strong><small>{item.group}</small></span><CaretRight size={14} /></button>)}{results.length === 0 && <div className="command-empty">Tidak ada halaman yang cocok.</div>}</div>
        </div>
      </div>}
    </div>
  );
}
