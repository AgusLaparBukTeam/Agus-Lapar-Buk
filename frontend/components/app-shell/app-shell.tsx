"use client";

import { Activity, FileCheck2, History, LayoutDashboard, LogOut, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMe, logout } from "@/lib/api";
import type { UserRole } from "@/lib/types";

const nav = [
  ["/dashboard", "Dashboard", LayoutDashboard, "operator"],
  ["/reconcile", "Rekonsiliasi", FileCheck2, "operator"],
  ["/history", "History", History, "operator"],
  ["/monitoring", "Monitoring", Activity, "operator"],
  ["/audit", "Audit trail", ScrollText, "supervisor"],
  ["/settings", "Settings", Settings, "admin"],
] as const;

function canSee(role: UserRole, minimum: string) {
  const levels = { operator: 1, supervisor: 2, admin: 3 };
  return levels[role] >= (levels[minimum as UserRole] || 1);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });

  async function signOut() {
    await logout();
    await client.invalidateQueries({ queryKey: ["auth", "me"] });
    router.replace("/login");
  }

  if (!user) return null;
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-[var(--border)] bg-[#102338] text-white lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:border-white/10">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#e5b95c] text-[#102338]"><ShieldCheck size={20} /></span>
          <div><div className="font-semibold tracking-tight">GateGuard</div><div className="text-[11px] text-white/60">Operations console</div></div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:overflow-visible lg:py-4" aria-label="Navigasi aplikasi">
          {nav.filter(([, , , minimum]) => canSee(user.role, minimum)).map(([href, label, Icon]) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return <Link key={href} href={href} className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors lg:mb-1 ${active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"}`}><Icon size={17} />{label}</Link>;
          })}
          {user.role === "admin" && <Link href="/settings/users" className={`flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm lg:mb-1 ${pathname.startsWith("/settings/users") ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"}`}><Users size={17} />Users</Link>}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <div className="truncate text-sm font-medium">{user.display_name}</div>
          <div className="mt-0.5 text-xs capitalize text-white/55">{user.role}</div>
          <button onClick={signOut} className="mt-4 flex items-center gap-2 text-xs text-white/65 hover:text-white"><LogOut size={14} />Keluar</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 lg:ml-64">
        <header className="flex items-center justify-between border-b border-[var(--border)] bg-white px-4 py-3 lg:px-8">
          <div><div className="text-xs uppercase tracking-[0.16em] text-[var(--subtle)]">Internal operations</div><div className="mt-0.5 text-sm font-semibold">Shipment document assurance</div></div>
          <div className="flex items-center gap-3 text-right"><div className="hidden sm:block"><div className="text-sm font-medium">{user.display_name}</div><div className="text-xs capitalize text-[var(--subtle)]">{user.role}</div></div><button onClick={signOut} aria-label="Keluar" className="rounded-md border border-[var(--border)] p-2 text-[var(--subtle)] hover:text-[var(--text)] lg:hidden"><LogOut size={16} /></button></div>
        </header>
        <main className="mx-auto max-w-[1440px] p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
