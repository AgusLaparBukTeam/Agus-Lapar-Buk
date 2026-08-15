"use client";

import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { ArchiveIcon as Archive, FunnelIcon as Filter, MagnifyingGlassIcon as Search } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { fetchAudit } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";

const eventLabels: Record<string, string> = { "auth.login.success": "Login berhasil", "auth.logout": "Logout", "reconciliation.created": "Rekonsiliasi dibuat", "shipment.created": "Pengiriman dibuat", "shipment.release_decision": "Keputusan release dicatat", "user.created": "Anggota ditambahkan", "user.updated": "Akses diperbarui" };
const actorLabels: Record<string, string> = { user: "Pengguna", service_account: "Service account", system: "Sistem" };
const ranges = [{ value: "1", label: "24 jam" }, { value: "7", label: "7 hari" }, { value: "30", label: "30 hari" }, { value: "all", label: "Semua" }];
const formatDate = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
const readable = (value: string) => eventLabels[value] || value.replaceAll("_", " ").replaceAll(".", " · ");
const metadataSummary = (metadata: Record<string, unknown>) => {
  for (const key of ["reason", "decision", "status", "notice"]) if (metadata[key] != null) return `${key}: ${String(metadata[key])}`;
  const keys = Object.keys(metadata);
  return keys.length ? `${keys.length} bidang metadata` : "Tercatat";
};

function ActorIdentity({ event }: { event: AuditEvent }) {
  const type = event.actor_type || "system";
  const identifier = event.actor_id || event.actor_service_account_id || event.actor_user_id;
  return <div className="cf-audit-actor"><span className="table-cell-primary">{event.actor_display_name || actorLabels[type] || "System"}</span><span className="cf-metadata">{actorLabels[type] || type}{identifier ? ` · ${identifier.slice(0, 8)}` : ""}</span></div>;
}

function AuditDetailDialog({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const actorId = event.actor_id || event.actor_service_account_id || event.actor_user_id;
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog className="cf-audit-dialog" size="lg">
    <Dialog.Title>Detail peristiwa audit</Dialog.Title>
    <Dialog.Description>Metadata telah disanitasi server-side. Credential, secret, token, dan payload mentah tidak ditampilkan.</Dialog.Description>
    <dl className="cf-audit-detail-grid">
      <div><dt>Waktu</dt><dd>{formatDate(event.created_at)}</dd></div><div><dt>Aksi</dt><dd>{readable(event.event_type)}</dd></div>
      <div><dt>Tipe aktor</dt><dd><OperationalState value={event.actor_type || "system"} /></dd></div><div><dt>Identitas</dt><dd>{event.actor_display_name || actorLabels[event.actor_type] || "Sistem"}</dd></div>
      <div><dt>ID aktor</dt><dd className="mono">{actorId || "—"}</dd></div><div><dt>Objek</dt><dd>{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}</dd></div>
      <div className="cf-audit-detail-grid__wide"><dt>Korelasi request</dt><dd className="mono">{event.request_id || "Tidak tersedia untuk peristiwa ini"}</dd></div>
    </dl>
    <section className="cf-audit-metadata"><div><h2 className="cf-section-title">Metadata aman</h2><p className="cf-metadata">Snapshot metadata pada saat peristiwa direkam.</p></div><pre>{JSON.stringify(event.metadata, null, 2)}</pre></section>
    <div className="form-panel__actions"><Button variant="secondary" onClick={onClose}>Tutup</Button></div>
  </Dialog></Dialog.Root>;
}

export default function AuditPage() {
  const [range, setRange] = useState("7");
  const [actorType, setActorType] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const result = useQuery({ queryKey: ["audit"], queryFn: fetchAudit });
  const events = useMemo(() => result.data || [], [result.data]);
  const latestEventTimestamp = useMemo(() => Math.max(0, ...events.map((event) => new Date(event.created_at).getTime())), [events]);
  const eventOptions = useMemo(() => [{ value: "all", label: "Semua aksi" }, ...Array.from(new Set(events.map((event) => event.event_type))).sort().map((value) => ({ value, label: readable(value) }))], [events]);
  const entityOptions = useMemo(() => [{ value: "all", label: "Semua objek" }, ...Array.from(new Set(events.map((event) => event.entity_type))).sort().map((value) => ({ value, label: value }))], [events]);
  const filtered = useMemo(() => {
    const threshold = range === "all" ? null : latestEventTimestamp - Number(range) * 86_400_000;
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (threshold && new Date(event.created_at).getTime() < threshold) return false;
      if (actorType !== "all" && event.actor_type !== actorType) return false;
      if (eventType !== "all" && event.event_type !== eventType) return false;
      if (entityType !== "all" && event.entity_type !== entityType) return false;
      if (!needle) return true;
      return [event.id, event.event_type, event.entity_type, event.entity_id, event.actor_display_name, event.actor_id, event.request_id, JSON.stringify(event.metadata)].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [actorType, entityType, eventType, events, latestEventTimestamp, query, range]);

  return <div className="operations-page cf-audit-page">
    <PageHeader icon={Archive} title="Log aktivitas" description="Rekaman terikat tenant untuk aksi, keputusan, akses, dan perubahan operasional. Gunakan filter untuk menyelidiki satu peristiwa." />
    <StateNotice title="Cakupan organisasi" tone="info">Hasil dibatasi pada workspace yang aktif. Tidak ada pengelolaan pengguna global atau peristiwa tenant lain di halaman ini.</StateNotice>
    <section className="cf-audit-filter-bar" aria-label="Filter log aktivitas">
      <div className="cf-audit-range"><span className="cf-label">Waktu</span><div className="segmented-control">{ranges.map((option) => <Button key={option.value} size="sm" variant={range === option.value ? "secondary" : "ghost"} onClick={() => setRange(option.value)}>{option.label}</Button>)}</div></div>
      <div className="cf-audit-selects"><AppSelect ariaLabel="Filter tipe aktor" value={actorType} onValueChange={setActorType} options={[{ value: "all", label: "Semua aktor" }, { value: "user", label: "Pengguna" }, { value: "service_account", label: "Service account" }, { value: "system", label: "Sistem" }]} /><AppSelect ariaLabel="Filter aksi" value={eventType} onValueChange={setEventType} options={eventOptions} /><AppSelect ariaLabel="Filter objek" value={entityType} onValueChange={setEntityType} options={entityOptions} /></div>
      <div className="cf-audit-search"><Search size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari aktor, aksi, ID objek, atau ID request" aria-label="Cari log aktivitas" /></div>
    </section>
    <DataTableSurface title="Peristiwa audit" description={`${filtered.length} dari ${events.length} peristiwa yang dikembalikan API. Metadata diproses aman sebelum sampai ke browser.`} actions={<Filter size={18} aria-hidden />}>
      {result.isLoading ? <div className="cf-table-loading">Memuat peristiwa audit…</div> : result.error ? <EmptyState icon={<Archive size={18} />} title="Log aktivitas belum tersedia" description={result.error instanceof Error ? result.error.message : "Coba muat ulang saat koneksi API tersedia."} /> : !filtered.length ? <EmptyState icon={<Archive size={18} />} title="Tidak ada peristiwa yang cocok" description="Ubah rentang waktu, filter, atau query untuk mencari catatan lain." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Waktu</Table.Head><Table.Head>Aksi</Table.Head><Table.Head>Pelaku</Table.Head><Table.Head>Objek</Table.Head><Table.Head>Ringkasan</Table.Head><Table.Head aria-label="Aksi" /></Table.Row></Table.Header><Table.Body>{filtered.map((event) => <Table.Row key={event.id}><Table.Cell><span className="cf-table-date">{formatDate(event.created_at)}</span></Table.Cell><Table.Cell><span className="table-cell-primary">{readable(event.event_type)}</span><br /><span className="cf-metadata mono">{event.id.slice(0, 8)}</span></Table.Cell><Table.Cell><ActorIdentity event={event} /></Table.Cell><Table.Cell><span>{event.entity_type}</span>{event.entity_id ? <><br /><span className="cf-metadata mono">{event.entity_id.slice(0, 8)}</span></> : null}</Table.Cell><Table.Cell><span className="cf-audit-summary">{metadataSummary(event.metadata)}</span></Table.Cell><Table.Cell><Button size="sm" variant="secondary" onClick={() => setSelected(event)}>Detail</Button></Table.Cell></Table.Row>)}</Table.Body></Table></div>}
    </DataTableSurface>
    {selected ? <AuditDetailDialog event={selected} onClose={() => setSelected(null)} /> : null}
  </div>;
}
