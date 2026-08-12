"use client";

import { ActivityIcon as Activity, GearIcon as Gear, UserListIcon as UserList } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchMe } from "@/lib/api";

function roleLabel(role?: string) {
  if (role === "admin") return "Administrator";
  if (role === "supervisor") return "Reviewer";
  return "Operator";
}

export default function ProfilePage() {
  const user = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });

  if (user.isPending || !user.data) return <main className="page-loading">Memuat profil…</main>;

  return <div className="operations-page profile-page">
    <PageHeader icon={UserList} title="Profil saya" description="Kelola identitas akun dan preferensi akses pribadi Anda." />
    <section className="profile-card">
      <div className="profile-card__identity">
        <span className="profile-card__avatar">{user.data.display_name.slice(0, 1).toUpperCase()}</span>
        <div><h2>{user.data.display_name}</h2><p>{user.data.email}</p><span className="profile-card__role">{roleLabel(user.data.role)}</span></div>
      </div>
      <dl className="profile-card__facts">
        <div><dt>Status akses</dt><dd>Aktif</dd></div>
        <div><dt>Ruang kerja</dt><dd>GateGuard Operations</dd></div>
        <div><dt>Metode autentikasi</dt><dd>Session server-side</dd></div>
      </dl>
      <div className="profile-card__actions">
        <ActionLink href="/change-password" icon={Gear}>Ganti password</ActionLink>
        <ActionLink href="/settings/notifications" icon={Activity} variant="secondary">Atur notifikasi</ActionLink>
      </div>
    </section>
  </div>;
}
