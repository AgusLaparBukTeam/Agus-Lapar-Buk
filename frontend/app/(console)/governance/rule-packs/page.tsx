"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ListChecksIcon as Rules } from "@phosphor-icons/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { fetchOperationsList } from "@/lib/api";

type RulePack = { id: string; name: string; version: string; scope: string; status: string; source: string; effective_from?: string | null; published_at?: string | null; published_by_display_name?: string | null };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "Belum ditetapkan";
const sourceLabel: Record<string, string> = { WORKSPACE: "Workspace", SHARED_BASELINE: "Baseline bersama" };

export default function RulePacksPage() {
  const [status, setStatus] = useState("all");
  const result = useQuery({ queryKey: ["rule-packs"], queryFn: () => fetchOperationsList("/rule-packs") });
  const items = useMemo(() => (result.data?.items || []) as RulePack[], [result.data]);
  const visible = items.filter((item) => status === "all" || item.status === status);
  return <div className="operations-page cf-rule-packs-page">
    <PageHeader icon={Rules} title="Paket aturan" description="Paket kebijakan deterministik yang menjelaskan bagaimana assurance mengevaluasi pengiriman. Publikasi membuat versi immutable." />
    <StateNotice title="Aturan dan evaluasi model dipisahkan" tone="info">Paket aturan menjalankan compliance decision deterministik. Status extraction/OCR atau confidence model tidak dapat mengubah paket aturan menjadi source of truth.</StateNotice>
    <section className="cf-governance-toolbar"><span className="cf-label">Status</span><AppSelect ariaLabel="Filter status paket aturan" value={status} onValueChange={setStatus} options={[{ value: "all", label: "Semua status" }, { value: "DRAFT", label: "DRAFT" }, { value: "PUBLISHED", label: "PUBLISHED" }]} /></section>
    <DataTableSurface title="Paket aturan" description={`${visible.length} dari ${items.length} paket yang tersedia untuk workspace ini. Sumber menunjukkan kepemilikan kebijakan.`}>{result.isLoading ? <div className="cf-table-loading">Memuat paket aturan…</div> : result.error ? <EmptyState icon={<Rules size={18} />} title="Paket aturan belum dapat dimuat" description={result.error instanceof Error ? result.error.message : "Muat ulang register tata kelola."} /> : !visible.length ? <EmptyState icon={<Rules size={18} />} title="Tidak ada paket aturan yang cocok" description="Ubah filter untuk melihat paket kebijakan lain." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Paket aturan</Table.Head><Table.Head>Versi</Table.Head><Table.Head>Status</Table.Head><Table.Head>Cakupan</Table.Head><Table.Head>Sumber</Table.Head><Table.Head>Mulai berlaku</Table.Head><Table.Head>Diterbitkan oleh</Table.Head><Table.Head aria-label="Aksi" /></Table.Row></Table.Header><Table.Body>{visible.map((item) => <Table.Row key={item.id}><Table.Cell><Link className="table-link table-cell-primary" href={`/governance/rule-packs/${item.id}`}>{item.name}</Link></Table.Cell><Table.Cell><span className="mono">{item.version}</span></Table.Cell><Table.Cell><OperationalState value={item.status} /></Table.Cell><Table.Cell>{item.scope}</Table.Cell><Table.Cell>{sourceLabel[item.source] || item.source}</Table.Cell><Table.Cell><span className="cf-table-date">{date(item.effective_from)}</span></Table.Cell><Table.Cell>{item.published_by_display_name || (item.status === "DRAFT" ? "Belum dipublikasikan" : "Tidak tersedia")}</Table.Cell><Table.Cell><Link className="table-link cf-table-action-link" href={`/governance/rule-packs/${item.id}`}>Tinjau</Link></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface>
  </div>;
}
