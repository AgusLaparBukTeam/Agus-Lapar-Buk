"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ListChecksIcon as ListChecks, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ActionLink, Button } from "@/components/ui/button";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { fetchMe, fetchWorkQueue, updateWorkQueue } from "@/lib/api";

function isOverdue(value: string | null | undefined, now: number | null) {
  return Boolean(value && now !== null && new Date(value).getTime() < now);
}

function dueLabel(value: string | null | undefined, now: number | null) {
  if (!value) return "Tidak ditetapkan";
  const due = new Date(value);
  return `${due.toLocaleString("id-ID")}${isOverdue(value, now) ? " · Terlambat" : ""}`;
}

export default function WorkQueuePage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("OPEN");
  const [priority, setPriority] = useState("");
  const [assignment, setAssignment] = useState("");
  const [due, setDue] = useState("");
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const params = new URLSearchParams({ page: String(page), page_size: "50" });
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (assignment === "unassigned") params.set("assignee", "unassigned");
  if (assignment === "mine" && me.data?.id) params.set("assignee", me.data.id);
  const query = params.toString();
  const result = useQuery({ queryKey: ["work-queue", query], queryFn: () => fetchWorkQueue(new URLSearchParams(query)) });
  const now = result.dataUpdatedAt || null;
  const update = useMutation({ mutationFn: (value: { id: string; status: "IN_PROGRESS" | "RESOLVED" }) => updateWorkQueue(value.id, value.status), onSuccess: () => client.invalidateQueries({ queryKey: ["work-queue"] }) });
  const items = useMemo(() => (result.data?.items || []).filter((task) => {
    if (!due || !task.due_at) return due !== "overdue" || Boolean(task.due_at);
    if (now === null) return true;
    const dueAt = new Date(task.due_at).getTime();
    return due === "overdue" ? dueAt < now : dueAt >= now;
  }), [due, now, result.data?.items]);

  return <CloudflarePageShell className="cf-work-queue-page">
    <PageHeader icon={ListChecks} title="Antrean kerja" description="Ambil dan selesaikan pemeriksaan yang memerlukan tindakan manusia sebelum pengiriman bergerak." actions={<ActionLink href="/shipments" variant="secondary">Cari pengiriman</ActionLink>} />
    <FilterBar className="cf-work-queue-toolbar" label="Filter antrean kerja">
      <AppSelect ariaLabel="Filter status antrean" value={status} onValueChange={(value) => { setPage(1); setStatus(value); }} options={[{ value: "OPEN", label: "Terbuka" }, { value: "IN_PROGRESS", label: "Sedang dikerjakan" }, { value: "RESOLVED", label: "Selesai" }, { value: "", label: "Semua status" }]} />
      <AppSelect ariaLabel="Filter prioritas antrean" value={priority} onValueChange={(value) => { setPage(1); setPriority(value); }} options={[{ value: "", label: "Semua prioritas" }, { value: "HIGH", label: "Tinggi" }, { value: "MEDIUM", label: "Sedang" }, { value: "LOW", label: "Rendah" }]} />
      <AppSelect ariaLabel="Filter penugasan" value={assignment} onValueChange={(value) => { setPage(1); setAssignment(value); }} options={[{ value: "", label: "Semua penugasan" }, { value: "mine", label: "Tugas saya" }, { value: "unassigned", label: "Belum ditugaskan" }]} />
      <AppSelect ariaLabel="Filter jatuh tempo" value={due} onValueChange={setDue} options={[{ value: "", label: "Semua jatuh tempo" }, { value: "overdue", label: "Terlambat" }, { value: "upcoming", label: "Belum jatuh tempo" }]} />
      {result.data && <span className="cf-metadata">{result.data.total} tugas</span>}
    </FilterBar>
    {result.isPending ? <div className="page-loading">Memuat antrean kerja…</div> : result.isError ? <div role="alert" className="notice notice--danger">Antrean kerja tidak tersedia saat ini.</div> : <>
      {due === "overdue" && <StateNotice tone="warning" title="Filter terlambat aktif">Tugas dengan waktu jatuh tempo sebelum saat ini diprioritaskan dalam tampilan ini.</StateNotice>}
      <DataTableSurface title="Tugas operasional" description={`${items.length} tugas cocok dengan filter aktif.`}>
        {items.length === 0 ? <EmptyState icon={<ListChecks size={20} />} title="Tidak ada tugas pada tampilan ini" description="Ubah filter atau kembali setelah assessment membuat tugas baru." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Prioritas</Table.Head><Table.Head>Tugas</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Tahap</Table.Head><Table.Head>Jatuh tempo</Table.Head><Table.Head>Penanggung jawab</Table.Head><Table.Head>Status</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{items.map((task) => <Table.Row key={task.id}><Table.Cell><OperationalState value={task.priority} /></Table.Cell><Table.Cell><span className="table-cell-primary">{task.issue}</span></Table.Cell><Table.Cell><Link className="table-link" href={`/shipments/${task.shipment_id}`}>{task.shipment_reference}</Link></Table.Cell><Table.Cell>{task.stage}</Table.Cell><Table.Cell><span className={isOverdue(task.due_at, now) ? "cf-due-overdue" : undefined}>{dueLabel(task.due_at, now)}</span></Table.Cell><Table.Cell>{task.assignee || "Belum ditugaskan"}</Table.Cell><Table.Cell><OperationalState value={task.status} /></Table.Cell><Table.Cell>{task.status === "OPEN" ? <Button variant="secondary" size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: "IN_PROGRESS" })}>Ambil tugas</Button> : task.status === "IN_PROGRESS" ? <Button size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: "RESOLVED" })}>Selesaikan</Button> : <span className="cf-metadata">Selesai</span>}</Table.Cell></Table.Row>)}</Table.Body></Table></div>}
      </DataTableSurface>
      {items.some((task) => isOverdue(task.due_at, now)) && <p className="cf-work-queue-note"><WarningCircle size={15} /> Jatuh tempo menggunakan waktu yang tersimpan pada tugas.</p>}
    </>}
    {result.data && <div className="pagination-row"><span className="muted-label">Halaman {page}</span><div className="pagination-actions"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><Button variant="secondary" size="sm" disabled={page * result.data.page_size >= result.data.total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
  </CloudflarePageShell>;
}
