"use client";

import {
  CaretRight,
  ClockCounterClockwise,
  FileText,
  Gear,
  House,
  ListChecks,
  MagnifyingGlass,
  Pulse,
  Question,
  SignOut,
  SidebarSimple,
  ShieldCheck,
  Users,
} from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { fetchMe, logout } from "@/lib/api";
import type { UserRole } from "@/lib/types";

const nav = [
  ["/dashboard", "Overview", House, "operator"],
  ["/reconcile", "Reconcile", FileText, "operator"],
  ["/history", "History", ClockCounterClockwise, "operator"],
  ["/monitoring", "Monitoring", Pulse, "operator"],
  ["/audit", "Audit trail", ListChecks, "supervisor"],
  ["/settings", "Settings", Gear, "admin"],
] as const;

const SIDEBAR_CHANGE_EVENT = "gateguard.sidebar.change";

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
  const match = nav.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  return match?.[1] || "Overview";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, getSidebarServerSnapshot);

  function toggleSidebar() {
    const next = !collapsed;
    window.localStorage.setItem("gateguard.sidebar.collapsed", String(next));
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
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
          <Button
            variant="ghost"
            shape="square"
            size="base"
            icon={SidebarSimple}
            aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
            title={collapsed ? "Open sidebar" : "Collapse sidebar"}
            className="console-sidebar__toggle"
            onClick={toggleSidebar}
          />
        </div>

        <div className="console-sidebar__context">
          <span className="console-context-dot" />
          <span className="console-context-name">Operations workspace</span>
          <CaretRight size={14} className="console-context-arrow" />
        </div>

        <nav className="console-sidebar__nav" aria-label="GateGuard navigation">
          <div className="console-sidebar__label">Workspace</div>
          {nav.filter(([, , , minimum]) => canSee(user.role, minimum)).map(([href, label, Icon]) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`console-nav-link ${active ? "is-active" : ""}`}
                title={collapsed ? label : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} />
                <span>{label}</span>
                {active && <span className="console-nav-link__active" />}
              </Link>
            );
          })}
          {user.role === "admin" && (
            <Link
              href="/settings/users"
              className={`console-nav-link ${pathname.startsWith("/settings/users") ? "is-active" : ""}`}
              title={collapsed ? "Users" : undefined}
            >
              <Users size={18} />
              <span>Users</span>
            </Link>
          )}
        </nav>

        <div className="console-sidebar__footer">
          <div className="console-user-avatar">{user.display_name.slice(0, 1).toUpperCase()}</div>
          <div className="console-user-copy">
            <div className="console-user-name">{user.display_name}</div>
            <div className="console-user-role">{user.role}</div>
          </div>
          <Button variant="ghost" shape="square" size="sm" icon={SignOut} aria-label="Sign out" title="Sign out" onClick={signOut} />
        </div>
      </aside>

      <div className="console-main">
        <header className="console-topbar">
          <div className="console-topbar__left">
            <Button
              variant="ghost"
              shape="square"
              size="base"
              icon={SidebarSimple}
              aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"}
              title={collapsed ? "Open sidebar" : "Collapse sidebar"}
              className="console-mobile-toggle"
              onClick={toggleSidebar}
            />
            <div className="console-breadcrumb"><span>GateGuard</span><CaretRight size={14} /><strong>{activeLabel(pathname)}</strong></div>
          </div>
          <div className="console-topbar__actions">
            <button type="button" className="console-search" aria-label="Quick search"><MagnifyingGlass size={16} /><span>Quick search</span><kbd>/</kbd></button>
            <Button variant="ghost" shape="square" size="base" icon={Question} aria-label="Help" title="Help" />
            <div className="console-topbar__account"><span className="console-user-avatar console-user-avatar--small">{user.display_name.slice(0, 1).toUpperCase()}</span><span>{user.display_name}</span></div>
          </div>
        </header>
        <main className="console-content">{children}</main>
      </div>
    </div>
  );
}
