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
import { DropdownMenu } from "@cloudflare/kumo/components/dropdown";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Input } from "@cloudflare/kumo/components/input";
import { hasMinimumRole } from "@/lib/access";
import { fetchGlobalSearch, fetchMe, fetchNotifications, fetchOrganizations, logout, markNotificationRead } from "@/lib/api";
import { languageSnapshot, setLanguage, subscribeToLanguage, translate, type AppLanguage, type LocaleKey } from "@/lib/locale";

const SIDEBAR_CHANGE_EVENT = "gateguard.sidebar.change";
const ORGANIZATION_CHANGE_EVENT = "gateguard.organization.change";

const NAVIGATION_KEYS: Record<string, LocaleKey> = {
  Home: "home", Overview: "overview", Recents: "recents", Operations: "operations",
  "Work queue": "workQueue", Shipments: "shipments", Documents: "documents", Parties: "parties",
  "Products & commodities": "products", Transport: "transport", "Release decisions": "releaseDecisions",
  Assurance: "assurance", "Document checks": "documentChecks", Requirements: "requirements",
  "Assurance checks": "assuranceChecks", Exceptions: "exceptions", "Party screening": "partyScreening",
  "Dangerous goods": "dangerousGoods", Observe: "observe", Analytics: "analytics",
  Observability: "observability", "Activity log": "activityLog", Integrate: "integrate",
  Connections: "connections", Webhooks: "webhooks", "Processing jobs": "processingJobs",
  Governance: "governance", "Rule packs": "rulePacks", "Reference data": "referenceData",
  Manage: "manage", "Workspace settings": "workspaceSettings", People: "people",
  "Roles & permissions": "rolesPermissions", Security: "security", Notifications: "notifications",
};

function localized(language: AppLanguage, value: string) {
  const key = NAVIGATION_KEYS[value];
  return key ? translate(language, key) : value;
}

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
function activeLabel(pathname: string, language: AppLanguage) { for (const group of groups) { const match = group.items.find(([href]) => pathname === href || pathname.startsWith(`${href}/`)); if (match) return localized(language, match[1]); } return translate(language, "overview"); }

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const user = session.data;
  const organizations = useQuery({ queryKey: ["organizations"], queryFn: fetchOrganizations, enabled: Boolean(user) });
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(), enabled: Boolean(user), refetchInterval: 30_000 });
  const collapsed = useSyncExternalStore(subscribeToSidebar, getSidebarSnapshot, getSidebarServerSnapshot);
  const language = useSyncExternalStore(subscribeToLanguage, languageSnapshot, () => "id" as AppLanguage);
  const t = (key: LocaleKey) => translate(language, key);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const selectedOrganizationId = useSyncExternalStore(subscribeToOrganization, getOrganizationSnapshot, getOrganizationServerSnapshot);

  const navigation = useMemo(() => groups.flatMap((group) => group.items.map(([href, label, Icon, minimum, keywords]) => ({ href, label: localized(language, label), Icon, minimum, keywords, group: localized(language, group.label) }))), [language]);
  const navResults = navigation.filter((item) => hasMinimumRole(user?.role, item.minimum) && [item.label, item.group, item.keywords].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const remote = useQuery({ queryKey: ["global-search", deferredSearch], queryFn: () => fetchGlobalSearch(deferredSearch), enabled: deferredSearch.trim().length > 1 && searchOpen });
  const remoteResults = useMemo(() => remote.data?.items || [], [remote.data]);
  const readNotification = useMutation({ mutationFn: markNotificationRead, onSuccess: () => client.invalidateQueries({ queryKey: ["notifications"] }) });
  const resultCount = navResults.length + remoteResults.length;

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); setSearch(""); setSelectedIndex(0); }
      if (event.key === "Escape") { setSearchOpen(false); }
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
  function openSearch() { setSearch(""); setSelectedIndex(0); setSearchOpen(true); }
  function selectWorkspace(id: string) { window.localStorage.setItem("gateguard.organization", id); window.dispatchEvent(new Event(ORGANIZATION_CHANGE_EVENT)); client.invalidateQueries(); window.location.reload(); }
  async function signOut() {
    await logout();
    client.clear();
    router.replace("/login");
  }
  if (session.isPending) return <main className="shell-loading" role="status"><span className="shell-loading__mark"><ShieldCheck size={20} weight="bold" /></span><div><strong>Memuat workspace GateGuard</strong><p>Menyiapkan data operasional dan akses Anda.</p></div></main>;
  if (!user) return <main className="shell-loading shell-loading--error" role="alert"><span className="shell-loading__mark"><ShieldCheck size={20} weight="bold" /></span><div><strong>Sesi tidak tersedia</strong><p>Silakan masuk kembali untuk membuka workspace GateGuard.</p></div></main>;

  return <div className="console-shell" data-sidebar-collapsed={collapsed}>
    <aside className="console-sidebar">
      <div className="console-sidebar__brand">{collapsed ? <Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label="Open sidebar" title="Open sidebar" className="console-brand-mark console-brand-mark--collapsed-toggle" onClick={toggleSidebar} /> : <><span className="console-brand-mark"><ShieldCheck size={20} weight="bold" /></span><span className="console-brand-name">GateGuard</span><Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label="Collapse sidebar" title="Collapse sidebar" className="console-sidebar__toggle" onClick={toggleSidebar} /></>}</div>
      <div className="workspace-switcher-wrap"><DropdownMenu><DropdownMenu.Trigger className="console-workspace-switcher" aria-label="Ganti ruang kerja"><span className="console-context-dot" /><span className="console-context-copy"><strong>{String(organizations.data?.items.find((item) => item.id === selectedOrganizationId)?.name || organizations.data?.items[0]?.name || "GateGuard Operations")}</strong><small>{t("organizationWorkspace")}</small></span><CaretDown size={14} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="workspace-menu" align="start" side="bottom" sideOffset={6}>{(organizations.data?.items || []).map((item) => <DropdownMenu.Item key={String(item.id)} onClick={() => selectWorkspace(String(item.id))}><span>{String(item.name)}</span><small>{String(item.code)}</small></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu></div>
      <Button type="button" variant="ghost" className="console-search console-search--sidebar" onClick={openSearch} aria-label={t("searchGateGuard")}><MagnifyingGlass size={16} /><span>{t("searchGateGuard")}</span><kbd>Ctrl K</kbd></Button>
      <nav className="console-sidebar__nav" aria-label="GateGuard navigation">{groups.map((group) => { const visible = group.items.filter(([, , , minimum]) => hasMinimumRole(user.role, minimum)); if (!visible.length) return null; return <div key={group.label} className="console-nav-group"><div className="console-sidebar__label">{localized(language, group.label)}</div>{visible.map(([href, label, Icon]) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`console-nav-link ${active ? "is-active" : ""}`} title={collapsed ? localized(language, label) : undefined} aria-current={active ? "page" : undefined}><Icon size={17} weight={active ? "fill" : "regular"} /><span>{localized(language, label)}</span>{active && <span className="console-nav-link__active" />}</Link>; })}</div>; })}</nav>
      <div className="console-sidebar__footer"><DropdownMenu><DropdownMenu.Trigger className="console-profile-trigger" aria-label="Buka menu profil"><span className="console-user-avatar">{user.display_name.slice(0, 1).toUpperCase()}</span><span className="console-user-copy"><span className="console-user-name">{user.display_name}</span><span className="console-user-role">{user.role === "admin" ? "Administrator" : user.role === "supervisor" ? "Reviewer" : "Operator"}</span></span><CaretDown className="console-profile-trigger__chevron" size={14} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="profile-menu" align="start" side="top" sideOffset={8}><DropdownMenu.Label><strong>{user.display_name}</strong><span>{user.email}</span></DropdownMenu.Label><DropdownMenu.Separator /><DropdownMenu.LinkItem href="/profile" icon={Users}>Profil saya</DropdownMenu.LinkItem><DropdownMenu.LinkItem href="/change-password" icon={Gear}>Ganti password</DropdownMenu.LinkItem><DropdownMenu.LinkItem href="/settings/notifications" icon={Activity}>Notifikasi</DropdownMenu.LinkItem><DropdownMenu.Separator /><DropdownMenu.Item icon={SignOut} onClick={signOut} variant="danger">Sign out</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu></div>
    </aside>
    <div className="console-main"><header className="console-topbar"><div className="console-topbar__left"><Button variant="ghost" shape="square" size="base" icon={SidebarSimple} aria-label={collapsed ? "Open sidebar" : "Collapse sidebar"} title={collapsed ? "Open sidebar" : "Collapse sidebar"} className="console-mobile-toggle" onClick={toggleSidebar} /><div className="console-breadcrumb"><span>GateGuard</span><CaretRight size={14} /><strong>{activeLabel(pathname, language)}</strong></div></div><div className="console-topbar__actions"><div className="notification-wrap"><DropdownMenu><DropdownMenu.Trigger className="console-icon-trigger" aria-label="Notifikasi"><Activity size={17} />{Boolean(notifications.data?.unread) && <span className="notification-count">{notifications.data?.unread && notifications.data.unread > 9 ? "9+" : notifications.data?.unread}</span>}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="notification-popover" align="end" side="bottom" sideOffset={8}><div className="notification-popover__header"><strong>Notifikasi</strong><span>{notifications.data?.unread || 0} belum dibaca</span></div>{notifications.data?.items?.length ? notifications.data.items.slice(0, 8).map((item) => <DropdownMenu.Item className={`notification-item ${item.read_at ? "is-read" : ""}`} key={String(item.id)} onClick={() => { if (!item.read_at) readNotification.mutate(String(item.id)); if (item.href) router.push(String(item.href)); }}><strong>{String(item.title)}</strong><span>{String(item.body)}</span><small>{new Date(String(item.created_at)).toLocaleString("id-ID")}</small></DropdownMenu.Item>) : <div className="notification-empty">Tidak ada notifikasi baru.</div>}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu></div><DropdownMenu><DropdownMenu.Trigger className="language-picker" aria-label={t("language")}><span>{language === "id" ? "ID" : "EN"}</span><CaretDown size={13} /></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="language-menu" align="end" side="bottom" sideOffset={8}><DropdownMenu.Item onClick={() => setLanguage("id")}>ID</DropdownMenu.Item><DropdownMenu.Item onClick={() => setLanguage("en")}>EN</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu><Link className="console-topbar__account" href="/profile" aria-label="Buka profil"><span className="console-user-avatar console-user-avatar--small">{user.display_name.slice(0, 1).toUpperCase()}</span><span>{user.display_name}</span></Link></div></header><main className="console-content">{children}</main><footer className="console-footer"><span>GateGuard</span><div><Link href="/settings/security">System status</Link><Link href="/settings">Documentation</Link><Link href="/profile">Privacy</Link><span>Build {process.env.NEXT_PUBLIC_APP_VERSION || "2026.08"}</span></div></footer></div>
    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog className="search-dialog" size="lg"><Dialog.Title className="sr-only">Search GateGuard</Dialog.Title><div className="search-dialog__input"><MagnifyingGlass size={18} /><Input autoFocus className="search-dialog__control" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedIndex(0); }} placeholder={t("searchPlaceholder")} aria-label={t("searchGateGuard")} /><Button variant="ghost" shape="square" size="sm" icon={X} aria-label="Close search" onClick={() => setSearchOpen(false)} /></div><div className="search-dialog__meta"><span>{search.trim() ? `${resultCount} ${t("results")}` : t("navigate")}</span><kbd>Esc to close</kbd></div><div className="search-dialog__results">{navResults.map((item, index) => <Button key={item.href} variant="ghost" className={`search-result ${selectedIndex === index ? "is-selected" : ""}`} onClick={() => { setSearchOpen(false); router.push(item.href); }}><item.Icon size={18} /><span className="search-result__copy"><span className="search-result__label">{item.label}</span><span className="search-result__group">{item.group}</span></span><CaretRight size={15} /></Button>)}{remoteResults.map((item, index) => <Button key={`${item.type}-${item.id}`} variant="ghost" className={`search-result ${selectedIndex === navResults.length + index ? "is-selected" : ""}`} onClick={() => { setSearchOpen(false); router.push(item.href); }}><MagnifyingGlass size={18} /><span className="search-result__copy"><span className="search-result__label">{item.label}</span><span className="search-result__group">{item.description}</span></span><CaretRight size={15} /></Button>)}{search.trim().length > 1 && !remote.isPending && !resultCount && <div className="search-empty">{t("noResults")}</div>}</div></Dialog></Dialog.Root>
  </div>;
}
