"use client";

import { ActivityIcon as Activity, ArrowsClockwiseIcon as Refresh, ClockCounterClockwiseIcon as History, MagnifyingGlassIcon as Search, QueueIcon as Queue } from "@phosphor-icons/react";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { MetricCell, OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { fetchObservability } from "@/lib/api";

type Tab = "overview" | "jobs" | "workers";
type ProcessingJob = { id: string; job_type: string; status: string; attempts: number; max_attempts: number; priority: number; queued_at: string; started_at?: string | null; heartbeat_at?: string | null; completed_at?: string | null; error_code?: string | null; safe_error?: string | null; shipment_id?: string | null };
type Worker = { worker_id: string; status: string; version?: string | null; last_heartbeat_at: string; current_job_id?: string | null };
type ObservabilityData = {
  application?: string; database?: string; worker?: string; extraction?: string; webhook?: string;
  workers?: Worker[]; jobs?: ProcessingJob[]; queue_depth?: number; jobs_succeeded?: number; jobs_failed?: number;
  oldest_queued_job?: ProcessingJob | null; connections?: { total?: number; enabled?: number };
};

const tabs = [{ value: "overview", label: "Ringkasan" }, { value: "jobs", label: "Processing jobs" }, { value: "workers", label: "Workers" }];
const jobStatusOptions = [{ value: "all", label: "Semua status" }, ...["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD_LETTER"].map((value) => ({ value, label: value }))];
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function JobDetailDialog({ job, onClose }: { job: ProcessingJob; onClose: () => void }) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog className="cf-job-detail-dialog" size="base">
    <Dialog.Title>Detail processing job</Dialog.Title>
    <Dialog.Description>Informasi operasional aman dari job tersimpan. Payload dan credential tidak ditampilkan.</Dialog.Description>
    <dl className="cf-job-detail-grid">
      <div><dt>ID job</dt><dd className="mono">{job.id}</dd></div><div><dt>Jenis</dt><dd>{job.job_type}</dd></div>
      <div><dt>Status</dt><dd><OperationalState value={job.status} /></dd></div><div><dt>Prioritas</dt><dd>{job.priority}</dd></div>
      <div><dt>Antrean</dt><dd>{dateTime(job.queued_at)}</dd></div><div><dt>Mulai</dt><dd>{dateTime(job.started_at)}</dd></div>
      <div><dt>Selesai</dt><dd>{dateTime(job.completed_at)}</dd></div><div><dt>Upaya</dt><dd>{job.attempts} / {job.max_attempts}</dd></div>
      <div><dt>Shipment</dt><dd className="mono">{job.shipment_id || "—"}</dd></div><div><dt>Kode error</dt><dd className="mono">{job.error_code || "—"}</dd></div>
    </dl>
    {job.safe_error ? <StateNotice title="Safe error" tone="danger">{job.safe_error}</StateNotice> : <StateNotice title="Tidak ada safe error" tone="info">Job ini belum merekam error yang aman untuk ditampilkan.</StateNotice>}
    <div className="form-panel__actions"><Button variant="secondary" onClick={onClose}>Tutup</Button></div>
  </Dialog></Dialog.Root>;
}

export default function ObservabilityPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);
  const result = useQuery({ queryKey: ["observability"], queryFn: fetchObservability, refetchInterval: 30_000 });
  const data = (result.data || {}) as ObservabilityData;
  const health = [["Application", data.application], ["Database", data.database], ["Worker", data.worker], ["Extraction", data.extraction], ["Webhooks", data.webhook]];
  const jobs = useMemo(() => data.jobs || [], [data.jobs]);
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const matchesStatus = status === "all" || job.status === status;
    const needle = query.trim().toLowerCase();
    return matchesStatus && (!needle || [job.id, job.job_type, job.status, job.error_code, job.shipment_id].some((value) => value?.toLowerCase().includes(needle)));
  }), [jobs, query, status]);
  const refresh = () => { void result.refetch(); };

  return <div className="operations-page cf-observability-page">
    <PageHeader icon={Activity} title="Observability" description="Ketersediaan layanan dan processing job untuk workspace ini. Data diperbarui otomatis setiap 30 detik." actions={<Button size="sm" variant="secondary" icon={Refresh} onClick={refresh} disabled={result.isFetching}>{result.isFetching ? "Memuat…" : "Muat ulang"}</Button>} />
    {result.error ? <StateNotice title="Observability tidak dapat dimuat" tone="danger">{result.error instanceof Error ? result.error.message : "Coba muat ulang data operasional."}</StateNotice> : null}
    <Tabs tabs={tabs} value={tab} onValueChange={(value) => setTab(value as Tab)} className="detail-tabs" aria-label="Bagian Observability" />

    {tab === "overview" && <div className="cf-observability-stack">
      <section className="health-strip cf-health-strip" aria-label="Kesehatan layanan">{health.map(([label, state]) => <div className="health-cell" key={String(label)}><span>{String(label)}</span><OperationalState value={String(state || "unknown")} /></div>)}</section>
      {data.webhook === "configured_not_dispatched" ? <StateNotice title="Webhook terkonfigurasi, delivery belum tersedia" tone="warning">Endpoint berlangganan ada, tetapi dispatch dan riwayat delivery belum diimplementasikan. Jangan gunakan state ini sebagai bukti notifikasi berhasil terkirim.</StateNotice> : null}
      <section className="metric-grid metric-grid--four" aria-label="Ringkasan processing"><MetricCell label="Antrean aktif" value={result.isLoading ? "—" : String(data.queue_depth ?? 0)} detail="QUEUED atau RUNNING" /><MetricCell label="Berhasil" value={result.isLoading ? "—" : String(data.jobs_succeeded ?? 0)} detail="Dari register job yang dikembalikan" /><MetricCell label="Gagal" value={result.isLoading ? "—" : String(data.jobs_failed ?? 0)} detail="FAILED atau DEAD LETTER" /><MetricCell label="Koneksi aktif" value={result.isLoading ? "—" : String(data.connections?.enabled ?? 0)} detail={`${data.connections?.total ?? 0} koneksi terdaftar`} /></section>
      <div className="cf-observability-overview-grid">
        <section className="data-panel"><div className="data-panel__header"><div><h2>Antrean pemrosesan</h2><p>Job dipersistenkan agar kegagalan dapat diselidiki dengan aman.</p></div><Queue size={20} /></div>{data.oldest_queued_job ? <div className="cf-queue-detail"><span className="cf-label">Job tertua di antrean</span><span>{data.oldest_queued_job.job_type}</span><span className="cf-metadata">Sejak {dateTime(data.oldest_queued_job.queued_at)}</span><Button variant="secondary" size="sm" onClick={() => { setSelectedJob(data.oldest_queued_job || null); setTab("jobs"); }}>Lihat job</Button></div> : <EmptyState icon={<Queue size={18} />} title="Antrean kosong" description="Tidak ada job QUEUED pada respons operasional saat ini." />}</section>
        <section className="data-panel"><div className="data-panel__header"><div><h2>Peristiwa pemrosesan terbaru</h2><p>Daftar job tersimpan, bukan stream log buatan.</p></div><History size={20} /></div>{jobs.length ? <ul className="cf-job-event-list">{jobs.slice(0, 5).map((job) => <li key={job.id}><div><span>{job.job_type}</span><small>{dateTime(job.completed_at || job.started_at || job.queued_at)}</small></div><OperationalState value={job.status} /></li>)}</ul> : <EmptyState icon={<History size={18} />} title="Belum ada processing job" description="Job akan muncul di sini setelah dokumen atau proses operasional masuk ke antrean." />}</section>
      </div>
      <StateNotice title="Tentang data observability" tone="info">GateGuard menampilkan health saat ini dan job yang dipersistenkan. Historic metrics dan raw application logs belum disimpan, sehingga tidak divisualisasikan sebagai chart.</StateNotice>
    </div>}

    {tab === "jobs" && <section className="cf-observability-stack"><div className="cf-job-toolbar"><div className="cf-job-search"><Search size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari ID, jenis, shipment, atau error" aria-label="Cari processing job" /></div><AppSelect ariaLabel="Filter status job" value={status} onValueChange={setStatus} options={jobStatusOptions} /></div><DataTableSurface title="Processing jobs" description="Maksimum 20 job terbaru dari API. Klik Detail untuk melihat timestamp dan safe error.">{result.isLoading ? <div className="cf-table-loading">Memuat processing job…</div> : !filteredJobs.length ? <EmptyState icon={<History size={18} />} title="Tidak ada job yang cocok" description={jobs.length ? "Ubah filter status atau kata kunci untuk melihat job lain." : "Belum ada job tersimpan untuk workspace ini."} /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Waktu antrean</Table.Head><Table.Head>Jenis</Table.Head><Table.Head>Status</Table.Head><Table.Head>Upaya</Table.Head><Table.Head>Safe error</Table.Head><Table.Head aria-label="Aksi" /></Table.Row></Table.Header><Table.Body>{filteredJobs.map((job) => <Table.Row key={job.id}><Table.Cell><span className="cf-table-date">{dateTime(job.queued_at)}</span></Table.Cell><Table.Cell><span className="table-cell-primary">{job.job_type}</span><br /><span className="cf-metadata mono">{job.id.slice(0, 8)}</span></Table.Cell><Table.Cell><OperationalState value={job.status} /></Table.Cell><Table.Cell><span className="mono">{job.attempts}/{job.max_attempts}</span></Table.Cell><Table.Cell><span className="cf-safe-error">{job.safe_error || "—"}</span></Table.Cell><Table.Cell><Button size="sm" variant="secondary" onClick={() => setSelectedJob(job)}>Detail</Button></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface></section>}

    {tab === "workers" && <section className="cf-observability-stack"><StateNotice title="Heartbeat worker live" tone="info">Endpoint hanya mengembalikan worker dengan heartbeat dalam dua menit. Worker offline tidak disimpulkan sebagai healthy dan tidak ditampilkan sebagai record hidup.</StateNotice><DataTableSurface title="Workers aktif" description="Heartbeat terbaru dari worker yang live pada respons ini.">{result.isLoading ? <div className="cf-table-loading">Memuat heartbeat worker…</div> : !(data.workers || []).length ? <EmptyState icon={<Activity size={18} />} title="Tidak ada worker live" description="Periksa deployment worker jika pemrosesan diperlukan. Status ini bukan bukti bahwa tidak ada worker terdaftar." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Worker</Table.Head><Table.Head>Status</Table.Head><Table.Head>Versi</Table.Head><Table.Head>Heartbeat terakhir</Table.Head><Table.Head>Job saat ini</Table.Head></Table.Row></Table.Header><Table.Body>{(data.workers || []).map((worker) => <Table.Row key={worker.worker_id}><Table.Cell><span className="table-cell-primary mono">{worker.worker_id}</span></Table.Cell><Table.Cell><OperationalState value={worker.status} /></Table.Cell><Table.Cell>{worker.version || "—"}</Table.Cell><Table.Cell>{dateTime(worker.last_heartbeat_at)}</Table.Cell><Table.Cell><span className="mono">{worker.current_job_id || "—"}</span></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface></section>}
    {selectedJob ? <JobDetailDialog job={selectedJob} onClose={() => setSelectedJob(null)} /> : null}
  </div>;
}
