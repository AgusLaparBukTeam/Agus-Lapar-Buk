"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { ListChecksIcon as Jobs, MagnifyingGlassIcon as Search, PulseIcon as Pulse } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { fetchOperationsList } from "@/lib/api";

type Job = { id: string; job_type: string; status: string; attempts: number; max_attempts: number; priority: number; queued_at: string; started_at?: string | null; completed_at?: string | null; error_code?: string | null; safe_error?: string | null; shipment_id?: string | null };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function JobsPage() {
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const result = useQuery({ queryKey: ["integration-jobs"], queryFn: () => fetchOperationsList("/integrations/jobs") });
  const jobs = useMemo(() => (result.data?.items || []) as Job[], [result.data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter((job) => (status === "all" || job.status === status) && (!needle || [job.id, job.job_type, job.shipment_id, job.error_code, job.safe_error].some((value) => value?.toLowerCase().includes(needle))));
  }, [jobs, query, status]);

  return <div className="operations-page cf-integration-jobs-page">
    <PageHeader icon={Jobs} title="Proses latar belakang" description="Register job ekstraksi, assessment, dan delivery yang dipersistenkan oleh workspace. Halaman ini bukan stream raw application logs." actions={<ActionLink href="/observability" variant="secondary" icon={Pulse}>Buka Observability</ActionLink>} />
    <StateNotice title="Batas register job" tone="info">Tampilan ini memuat job yang dikembalikan API. Gunakan Observability untuk health worker dan queue saat ini; payload job serta credential tidak tersedia di UI.</StateNotice>
    <section className="cf-job-toolbar"><div className="cf-job-search"><Search size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari ID, jenis, pengiriman, atau error" aria-label="Cari job pemrosesan" /></div><AppSelect ariaLabel="Filter status job" value={status} onValueChange={setStatus} options={[{ value: "all", label: "Semua status" }, ...["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD_LETTER"].map((value) => ({ value, label: value }))]} /></section>
    <DataTableSurface title="Register job" description={`${filtered.length} dari ${jobs.length} job pada respons ini. Pesan error aman ditampilkan hanya bila backend mencatat versi aman.`}>{result.isLoading ? <div className="cf-table-loading">Memuat job pemrosesan…</div> : result.error ? <EmptyState icon={<Jobs size={18} />} title="Register job belum dapat dimuat" description={result.error instanceof Error ? result.error.message : "Muat ulang saat API tersedia."} /> : !filtered.length ? <EmptyState icon={<Jobs size={18} />} title="Tidak ada job yang cocok" description="Ubah kata kunci atau status untuk melihat job lain." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Antrean</Table.Head><Table.Head>Jenis</Table.Head><Table.Head>Status</Table.Head><Table.Head>Upaya</Table.Head><Table.Head>Prioritas</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Pesan error aman</Table.Head></Table.Row></Table.Header><Table.Body>{filtered.map((job) => <Table.Row key={job.id}><Table.Cell><span className="cf-table-date">{date(job.queued_at)}</span></Table.Cell><Table.Cell><span className="table-cell-primary">{job.job_type}</span><br /><span className="cf-metadata mono">{job.id.slice(0, 8)}</span></Table.Cell><Table.Cell><OperationalState value={job.status} /></Table.Cell><Table.Cell><span className="mono">{job.attempts}/{job.max_attempts}</span></Table.Cell><Table.Cell>{job.priority}</Table.Cell><Table.Cell><span className="mono">{job.shipment_id?.slice(0, 8) || "—"}</span></Table.Cell><Table.Cell><span className="cf-safe-error">{job.safe_error || "—"}</span></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface>
  </div>;
}
