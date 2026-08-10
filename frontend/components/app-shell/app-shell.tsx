"use client";

import {
  ActivityIcon as Activity,
  ArchiveIcon as Archive,
  CaretDownIcon as CaretDown,
  CaretRightIcon as CaretRight,
  ChartLineIcon as ChartLine,
  ClockCounterClockwiseIcon as ClockCounterClockwise,
  FileTextIcon as FileText,
  GearIcon as Gear,
  HouseIcon as House,
  ListChecksIcon as ListChecks,
  MagnifyingGlassIcon as MagnifyingGlass,
  PackageIcon as Package,
  SignOutIcon as SignOut,
  SidebarSimpleIcon as SidebarSimple,
  ShieldCheckIcon as ShieldCheck,
  StorefrontIcon as Storefront,
  UsersIcon as Users,
  XIcon as X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { fetchGlobalSearch, fetchMe, fetchNotifications, fetchOrganizations, logout, markNotificationRead } from "@/lib/api";
import type { UserRole } from "@/lib/types";

const SIDEBAR_CHANGE_EVENT = "gateguard.sidebar.change";
const ORGANIZATION_CHANGE_EVENT = "gateguard.organization.change";

const groups = [
  { label: "Home", items: [["/dashboard", "Overview", House, "operator", "home summary"] as const, ["/recents", "Recents", ClockCounterClockwise, "operator", "recently opened"] as const] },
  { label: "Operations", items: [
    ["/work-queue", "Work queue", ListChecks, "operator", "open overdue assigned"] as const,
    ["/shipments", "Shipments", Package, "operator", "shipment cases release"] as const,
    ["/documents", "Documents", FileText, "operator", "evidence vault files"] as const,
    ["/parties", "Parties", Users, "operator", "shipper consignee carrier"] as const,
    ["/products", "Products & commodities", Storefront, "operator", "items sku dangerous goods"] as const,
    ["/transport", "Transport", Package, "operator", "carrier legs equipment"] as const,
    ["/releases", "Release decisions", ShieldCheck, "supervisor", "authorize hold invalidate"] as const,
  ] },
  { label: "Assurance", items: [
    ["/reconcile", "Document checks", FileText, "operator", "invoice packing list compare"] as const,
    ["/requirements", "Requirements", ListChecks, "operator", "required documents rules"] as const,
    ["/assurance", "Assurance checks", ShieldCheck, "operator", "checks evidence status"] as const,
    ["/exceptions", "Exceptions", Activity, "operator", "issues blockers resolve"] as const,
    ["/screening", "Party screening", Users, "operator", "screened matches review"] as const,
    ["/dangerous-goods", "Dangerous goods", Package, "operator", "un number hazard declaration"] as const,
  ] },
  { label: "Observe", items: [
    ["/analytics", "Analytics", ChartLine, "operator", "volume decisions exceptions"] as const,
    ["/observability", "Observability", Activity, "supervisor", "processing jobs availability"] as const,
    ["/audit", "Activity log", Archive, "supervisor", "history events access"] as const,
  ] },
  { label: "Integrate", items: [
    ["/integrations/connections", "Connections", Storefront, "admin", "configured systems"] as const,
    ["/integrations/webhooks", "Webhooks", Activity, "admin", "event delivery"] as const,
    ["/integrations/jobs", "Processing jobs", ChartLine, "supervisor", "extraction retries failures"] as const,
  ] },
  { label: "Governance", items: [
    ["/governance/rule-packs", "Rule packs", ListChecks, "admin", "published safeguards"] as const,
    ["/governance/reference-data", "Reference data", Archive, "admin", "countries currencies units"] as const,
  ] },
  { label: "Manage", items: [
    ["/settings", "Workspace settings", Gear, "operator", "workspace policy"] as const,
    ["/settings/people", "People", Users, "admin", "users access sessions"] as const,
    ["/settings/roles", "Roles & permissions", ShieldCheck, "admin", "permissions matrix"] as const,
    ["/settings/security", "Security", ShieldCheck, "admin", "sessions authentication"] as const,
    ["/settings/notifications", "Notifications", Activity, "operator", "alerts preferences"] as const,
  ] },
] as const;

function subscribeToSidebar(callback: () => void) { window.addEventListener(SIDEBAR_CHANGE_EVENT, callback); return () => window.removeEventListener(SIDEBAR_CHANGE_EVENT, callback); }
function getSidebarSnapshot() { return window.localStorage.getItem("gateguard.sidebar.collapsed") === "true"; }
function getSidebarServerSnapshot() { return false; }
function subscribeToOrganization(callback: () => void) { window.addEventListener(ORGANIZATION_CHANGE_EVENT, callback); return () => window.removeEventListener(ORGANIZATION_CHANGE_EVENT, callback); }
function getOrganizationSnapshot() { return window.localStorage.getItem("gateguard.organization") || ""; }
function getOrganizationServerSnapshot() { return ""; }
function canSee(role: UserRole, minimum: string) { const levels = { operator: 1, supervisor: 2, admin: 3 }; return levels[role] >= (levels[minimum as UserRole] || 1); }
function activeLabel(pathname: string) { for (const group of groups) { const match = group.items.find(([href]) => pathname === href || pathname.startsWith(`${href}/`)); if (match) return match[1]; } return "Overview"; }

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const organizations = useQuery({ queryKey: ["organizations"], queryFn: fetchOrganizations, enabled: Boolean(user) });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(), enabled: Boolean(user), refetchInterval: 30_000 });
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const selectedOrganizationId = useSyncExternalStore(subscribeToOrganization, getOrganizationSnapshot, getOrganizationServerSnapshot);

  const navigation = useMemo(() => groups.flatMap((group) => group.items.map(([href, label, Icon, minimum, keywords]) => ({ href, label, Icon, minimum, keywords, group: group.label }))), []);
  const navResults = navigation.filter((item) => canSee(user?.role || "operator", item.minimum) && [item.label, item.group, item.keywords].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const remote = useQuery({ queryKey: ["global-search", deferredSearch], queryFn: () => fetchGlobalSearch(deferredSearch), enabled: deferredSearch.trim().length > 1 && searchOpen });
  const remoteResults = useMemo(() => remote.data?.items || [], [remote.data]);
  const readNotification = useMutation({ mutationFn: markNotificationRead, onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const resultCount = navResults.length + remoteResults.length;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); setSearch(""); setSelectedIndex(0); }
      if (event.key === "Escape") { setSearchOpen(false); setWorkspaceOpen(false); }
      if (!searchOpen) return;
      if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((value) => Math.min(value + 1, Math.max(resultCount - 1, 0))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((value) => Math.max(value - 1, 0)); }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = navResults[selectedIndex]?.href || remoteResults[selectedIndex - navResults.length]?.href;
        if (target) { setSearchOpen(false); router.push(target); }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navResults, remoteResults, resultCount, router, searchOpen, selectedIndex]);

  function toggleSidebar() { const next = !collapsed; window.localStorage.setItem("gateguard.sidebar.collapsed", String(next)); window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT)); }
  function openSearch() { setWorkspaceOpen(false); setSearch(""); setSelectedIndex(0); setSearchOpen(true); }
  function selectWorkspace(id: string) { window.localStorage.setItem("gateguard.organization", id); window.dispatchEvent(new Event(ORGANIZATION_CHANGE_EVENT)); setWorkspaceOpen(false); client.invalidateQueries(); window.location.reload(); }
  async function signOut() { await logout(); await client.invalidateQueries({ queryKey: ["auth", "me"] }); router.replace("/login"); }
  if (!user) return null;

  return <div className="console-shell" data-sidebar-collapsed={collapsed}>
    <aside className="console-sidebar">
      <div className="console-sidebar__brand">{collapsed ? <Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label="Open sidebar" title="Open sidebar" className="console-brand-mark console-brand-mark--collapsed-toggle" onClick={toggleSidebar} /> : <><span className="console-brand-mark"><ShieldCheck size={20} weight="bold" /></span><span className="console-brand-name">GateGuard</span><Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label="Collapse sidebar" title="Collapse sidebar" className="console-sidebar__toggle" onClick={toggleSidebar} /></>}</div>
      <div className="workspace-switcher-wrap"><button type="button" className="console-workspace-switcher" onClick={() => setWorkspaceOpen((value) => !value)} aria-expanded={workspaceOpen}><span className="console-context-dot" /><span className="console-context-copy"><strong>{String(organizations.data?.items.find((item) => item.id === selectedOrganizationId)?.name || organizations.data?.items[0]?.name || "GateGuard Operations")}</strong><small>Organization workspace</small></span><CaretDown size={14} /></button>{workspaceOpen && <div className="workspace-menu" role="menu">{(organizations.data?.items || []).map((item) => <button type="button" role="menuitem" key={String(item.id)} onClick={() => selectWorkspace(String(item.id))}><span>{String(item.name)}</span><small>{String(item.code)}</small></button>)}</div>}</div>
      <button type="button" className="console-search console-search--sidebar" onClick={openSearch} aria-label="Search GateGuard"><MagnifyingGlass size={16} /><span>Search GateGuard</span><kbd>Ctrl K</kbd></button>
      <nav className="console-sidebar__nav" aria-label="GateGuard navigation">{groups.map((group) => { const visible = group.items.filter(([, , , minimum]) => canSee(user.role, minimum)); if (!visible.length) return null; return <div key={group.label} className="console-nav-group"><div className="console-sidebar__label">{group.label}</div>{visible.map(([href, label, Icon]) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`console-nav-link ${active ? "is-active" : ""}`} title={collapsed ? label : undefined} aria-current={active ? "page" : undefined}><Icon size={17} weight={active ? "fill" : "regular"} /><span>{label}</span>{active && <span className="console-nav-link__active" />}</Link>; })}</div>; })}</nav>
      <div className="console-sidebar__footer"><div className="console-user-avatar">{user.display_name.slice(0, 1).toUpperCase()}</div><div className="console-user-copy"><div className="console-user-name">{user.display_name}</div><div className="console-user-role">{user.role === "admin" ? "Administrator" : user.role === "supervisor" ? "Reviewer" : "Operator"}</div></div><Button variant="ghost" shape="square" size="sm" icon={SignOut} aria-label="Sign out" title="Sign out" onClick={signOut} /></div>
    </aside>
    <div className="console-main"><header className="console-topbar"><div className="console-topbar__left"><Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"} title={collapsed ? "Open sidebar" : "Collapse sidebar"} className="console-mobile-toggle" onClick={toggleSidebar} /><div className="console-breadcrumb"><span>GateGuard</span><CaretRight size={14} /><strong>{activeLabel(pathname)}</strong></div></div><div className="console-topbar__actions"><Button variant="ghost" className="console-search" onClick={openSearch} aria-label="Search GateGuard"><MagnifyingGlass size={16} /><span>Search</span><kbd>Ctrl K</kbd></Button><div className="notification-wrap"><Button variant="ghost" shape="square" size="base" icon={Activity} aria-label="Notifications" title="Notifications" onClick={() => setNotificationsOpen((value) => !value)} />{Boolean(notifications.data?.unread) && <span className="notification-count">{notifications.data?.unread && notifications.data.unread > 9 ? "9+" : notifications.data?.unread}</span>}{notificationsOpen && <div className="notification-popover" role="dialog" aria-label="Notifications"><div className="notification-popover__header"><strong>Notifications</strong><span>{notifications.data?.unread || 0} unread</span></div>{notifications.data?.items?.length ? notifications.data.items.slice(0, 8).map((item) => <button type="button" className={`notification-item ${item.read_at ? "is-read" : ""}`} key={String(item.id)} onClick={() => { if (!item.read_at) readNotification.mutate(String(item.id)); if (item.href) router.push(String(item.href)); setNotificationsOpen(false); }}><strong>{String(item.title)}</strong><span>{String(item.body)}</span><small>{new Date(String(item.created_at)).toLocaleString("en-GB")}</small></button>) : <div className="notification-empty">No new operational notifications.</div>}</div>}</div><div className="console-topbar__account"><span className="console-user-avatar console-user-avatar--small">{user.display_name.slice(0, 1).toUpperCase()}</span><span>{user.display_name}</span></div></div></header><main className="console-content">{children}</main></div>
    {searchOpen && <div className="search-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search GateGuard"><div className="search-dialog__input"><MagnifyingGlass size={18} /><input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIndex(0); }} placeholder="Search pages, shipments, documents..." aria-label="Search GateGuard" /><Button variant="ghost" shape="square" size="sm" icon={X} aria-label="Close search" onClick={() => setSearchOpen(false)} /></div><div className="search-dialog__meta"><span>{search.trim() ? `${resultCount} results` : "Navigate GateGuard"}</span><kbd>Esc to close</kbd></div><div className="search-dialog__results">{navResults.map((item, index) => <Button key={item.href} variant="ghost" className={`search-result ${selectedIndex === index ? "is-selected" : ""}`} onClick={() => { setSearchOpen(false); router.push(item.href); }}><item.Icon size={18} /><span><strong>{item.label}</strong><small>{item.group}</small></span><CaretRight size={15} /></Button>)}{remoteResults.map((item, index) => <Button key={`${item.type}-${item.id}`} variant="ghost" className={`search-result ${selectedIndex === navResults.length + index ? "is-selected" : ""}`} onClick={() => { setSearchOpen(false); router.push(item.href); }}><MagnifyingGlass size={18} /><span><strong>{item.label}</strong><small>{item.description}</small></span><CaretRight size={15} /></Button>)}{search.trim().length > 1 && !remote.isPending && !resultCount && <div className="search-empty">No matching workspace records or pages.</div>}</div></section></div>}
  </div>;
}
