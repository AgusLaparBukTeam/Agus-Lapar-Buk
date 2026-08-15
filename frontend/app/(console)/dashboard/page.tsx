"use client";

import { TimeseriesChart } from "@cloudflare/kumo/components/chart";
import { ChartLineIcon as ChartLine, ClockCounterClockwiseIcon as ClockCounterClockwise, HouseIcon as House, ListChecksIcon as ListChecks, PackageIcon as Package, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import * as echarts from "echarts";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { OperationalState, MetricCell, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { ChartSurface, CloudflarePageShell, DataTableSurface, EmptyState, MainAsideLayout, MetricsHeader } from "@/components/ui/page-primitives";
import { fetchAnalyticsSummary, fetchAnalyticsTimeseries, fetchOperationsList, fetchRecents } from "@/lib/api";

type EventSeries = { name: string; color: string; data: [number, number][] };

function number(value: unknown) { return typeof value === "number" ? value : 0; }

export default function DashboardPage() {
  const summary = useQuery({ queryKey: ["analytics-summary", 7], queryFn: () => fetchAnalyticsSummary(7), refetchInterval: 30_000 });
  const timeseries = useQuery({ queryKey: ["analytics-timeseries", 7], queryFn: () => fetchAnalyticsTimeseries(7), refetchInterval: 30_000 });
  const recents = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });
  const exceptions = useQuery({ queryKey: ["dashboard-exceptions"], queryFn: () => fetchOperationsList("/exceptions", { status: "OPEN" }) });

  if (summary.isPending) return <CloudflarePageShell><div className="page-loading">Memuat ringkasan operasional…</div></CloudflarePageShell>;
  if (summary.isError || !summary.data) return <CloudflarePageShell><div role="alert" className="notice notice--danger">Ringkasan ruang kerja tidak tersedia saat ini.</div></CloudflarePageShell>;

  const data = summary.data;
  const eventSeries = Array.isArray(timeseries.data?.series) ? timeseries.data?.series as EventSeries[] : [];
  const recent = recents.data?.items || [];
  const openExceptions = exceptions.data?.items || [];
  const overdue = number(data.overdue_work);
  const ready = number(data.release_authorized);

  return <CloudflarePageShell className="cf-dashboard-page">
    <PageHeader icon={House} title="Ringkasan operasional" description="Lihat pengiriman yang bergerak, keputusan pelepasan, dan pekerjaan yang memerlukan tindakan." actions={<ActionLink href="/shipments/new" variant="primary" icon={Package}>Buat pengiriman</ActionLink>} />
    <MetricsHeader className="cf-metric-strip--overview" label="Metrik operasional tujuh hari">
      <MetricCell label="Pengiriman aktif" value={number(data.active_shipments)} detail="Belum dikirim atau ditutup" />
      <MetricCell label="Kasus baru" value={number(data.assessments)} detail="Dibuat dalam 7 hari terakhir" />
      <MetricCell label="Pengecualian terbuka" value={number(data.open_exceptions)} detail="Butuh resolusi terdokumentasi" />
      <MetricCell label="Siap dikirim" value={ready} detail="Sudah RELEASE_AUTHORIZED" />
    </MetricsHeader>
    {overdue > 0 && <StateNotice tone="warning" title={`${overdue} pekerjaan melewati target`}>Buka antrean kerja untuk memprioritaskan tugas yang belum diselesaikan.</StateNotice>}
    <MainAsideLayout className="cf-dashboard-overview-grid">
      <ChartSurface title="Aktivitas tersimpan" description="Event audit per hari untuk tujuh hari terakhir." actions={<ActionLink href="/analytics" variant="ghost" icon={ChartLine}>Buka analitik</ActionLink>}>
        {timeseries.isPending ? <div className="cf-chart-loading">Memuat aktivitas…</div> : eventSeries.length ? <TimeseriesChart echarts={echarts} data={eventSeries} xAxisName="Tanggal" yAxisName="Event" xAxisTickCount={7} yAxisTickCount={4} tooltipValueFormat={(value) => `${value} event`} /> : <EmptyState icon={<ChartLine size={18} />} title="Belum ada aktivitas dalam periode ini" description="Event audit akan tampil di sini saat pengiriman, assessment, atau keputusan direkam." />}
      </ChartSurface>
      <DataTableSurface title="Status saat ini" description="Konteks keputusan yang perlu dipantau.">
        <dl className="cf-dashboard-state-list"><div><dt>Pekerjaan terlambat</dt><dd><OperationalState value={overdue ? "REVIEW" : "CLEAR"} /><span>{overdue}</span></dd></div><div><dt>Pelepasan siap dikirim</dt><dd><OperationalState value={ready ? "AUTHORIZED" : "—"} /><span>{ready}</span></dd></div><div><dt>Antrean perhatian</dt><dd><OperationalState value={openExceptions.length ? "REVIEW" : "CLEAR"} /><span>{openExceptions.length}</span></dd></div></dl>
        <div className="cf-data-surface__footer"><ActionLink href="/work-queue" variant="ghost" icon={ListChecks}>Buka antrean kerja</ActionLink></div>
      </DataTableSurface>
    </MainAsideLayout>
    <DataTableSurface title="Perlu perhatian" description="Pengecualian terbuka tetap terlihat sampai terselesaikan." actions={<ActionLink href="/exceptions" variant="ghost" icon={WarningCircle}>Lihat pengecualian</ActionLink>}>
      {exceptions.isError ? <div role="alert" className="notice notice--danger">Daftar pengecualian tidak tersedia.</div> : openExceptions.length ? <div className="activity-list">{openExceptions.slice(0, 6).map((item) => <a key={String(item.id)} href={`/shipments/${String(item.shipment_id)}`} className="activity-row"><div><span className="table-cell-primary">{String(item.summary)}</span><small>{String(item.shipment_reference)} · {String(item.severity)} · {String(item.status)}</small></div><WarningCircle size={18} /></a>)}</div> : <EmptyState icon={<ListChecks size={17} />} title="Tidak ada pengecualian terbuka" description="Temuan baru akan muncul di sini ketika pengiriman membutuhkan perhatian." />}
    </DataTableSurface>
    <DataTableSurface title="Terakhir dibuka" description="Lanjutkan dari record yang terakhir Anda tinjau." actions={<ActionLink href="/recents" variant="ghost" icon={ClockCounterClockwise}>Lihat semua</ActionLink>}>
      {recents.isError ? <div role="alert" className="notice notice--danger">Daftar aktivitas terakhir tidak tersedia.</div> : recent.length ? <div className="activity-list">{recent.slice(0, 6).map((item) => <a key={`${String(item.object_type)}-${String(item.object_id)}`} href={String(item.href)} className="activity-row"><div><span className="table-cell-primary">{String(item.label)}</span><small>{String(item.object_type)} · {new Date(String(item.viewed_at)).toLocaleString("id-ID")}</small></div><ClockCounterClockwise size={17} /></a>)}</div> : <EmptyState title="Belum ada record terakhir" description="Buka pengiriman atau pengaturan ruang kerja untuk menambahkannya ke daftar ini." />}
    </DataTableSurface>
  </CloudflarePageShell>;
}
