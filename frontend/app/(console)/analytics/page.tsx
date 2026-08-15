"use client";

import { ChartLineIcon as ChartLine, ClockIcon as Clock, ArrowsClockwiseIcon as Refresh } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AssuranceTimeseries } from "@/components/analytics/timeseries-chart";
import { ActionLink, Button } from "@/components/ui/button";
import { MetricCell, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { fetchAnalyticsSummary, fetchAnalyticsTimeseries } from "@/lib/api";

const ranges = [[1, "24 jam"], [7, "7 hari"], [30, "30 hari"]] as const;
const eventGroups = [
  ["all", "Semua peristiwa"],
  ["shipment", "Pengiriman"],
  ["processing", "Pemrosesan"],
] as const;
type Breakdown = { key: string; value: number };
type AnalyticsData = {
  active_shipments?: number; assessments?: number; open_exceptions?: number; overdue_work?: number; release_authorized?: number;
  breakdowns?: Record<string, Breakdown[]>;
};
type ChartSeries = { key?: string; name: string; data: [number, number][] };

const displayState = (value: string) => value.replaceAll("_", " ").replaceAll(".", " · ");

function BreakdownPanel({ title, description, items }: { title: string; description: string; items: Breakdown[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return <section className="cf-breakdown-panel">
    <header><div><h2 className="cf-section-title">{title}</h2><p className="cf-metadata">{description}</p></div><span className="cf-metadata">{total} catatan</span></header>
    {!items.length ? <p className="cf-breakdown-panel__empty">Tidak ada catatan pada rentang ini.</p> : <ul className="cf-breakdown-list">{items.map((item) => <li key={item.key}><span>{displayState(item.key)}</span><span className="mono">{item.value}</span></li>)}</ul>}
  </section>;
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const [eventGroup, setEventGroup] = useState<(typeof eventGroups)[number][0]>("all");
  const summary = useQuery({ queryKey: ["analytics-summary", days], queryFn: () => fetchAnalyticsSummary(days) });
  const series = useQuery({ queryKey: ["analytics-series", days], queryFn: () => fetchAnalyticsTimeseries(days) });
  const value = (summary.data || {}) as AnalyticsData;
  const rawSeries = useMemo(() => (series.data?.series || []) as ChartSeries[], [series.data]);
  const chartSeries = useMemo(() => rawSeries.filter((item) => {
    const key = item.key || item.name.toLowerCase();
    if (eventGroup === "shipment") return key.startsWith("shipment.");
    if (eventGroup === "processing") return /document|extraction|reconciliation/.test(key);
    return true;
  }), [eventGroup, rawSeries]);
  const breakdowns = value.breakdowns || {};
  const isLoading = summary.isLoading || series.isLoading;
  const error = summary.error || series.error;
  const metric = (number: number | undefined) => isLoading ? "—" : String(number ?? 0);
  const refresh = () => { void summary.refetch(); void series.refetch(); };

  return <div className="operations-page cf-analytics-page">
    <PageHeader
      icon={ChartLine}
      title="Analytics"
      description="Analisis peristiwa pengiriman, assurance, dan pemrosesan dari workspace ini. Nilai hanya dihitung dari catatan yang tersimpan."
      actions={<div className="cf-page-actions"><Button variant="secondary" size="sm" onClick={refresh} disabled={summary.isFetching || series.isFetching} icon={Refresh}>{summary.isFetching || series.isFetching ? "Memuat…" : "Muat ulang"}</Button><ActionLink href="/audit" variant="secondary" icon={Clock}>Buka audit trail</ActionLink></div>}
    />

    <section className="cf-analysis-controls" aria-label="Kontrol Analytics">
      <div><span className="cf-label">Rentang waktu</span><div className="segmented-control" aria-label="Rentang waktu">{ranges.map(([rangeDays, label]) => <Button key={rangeDays} size="sm" variant={days === rangeDays ? "secondary" : "ghost"} onClick={() => setDays(rangeDays)}>{label}</Button>)}</div></div>
      <div><span className="cf-label">Kelompok metrik</span><div className="segmented-control" aria-label="Kelompok metrik">{eventGroups.map(([value, label]) => <Button key={value} size="sm" variant={eventGroup === value ? "secondary" : "ghost"} onClick={() => setEventGroup(value)}>{label}</Button>)}</div></div>
    </section>

    {error ? <StateNotice title="Data Analytics tidak dapat dimuat" tone="danger">{error instanceof Error ? error.message : "Coba muat ulang atau periksa koneksi API."}</StateNotice> : null}

    <section className="metric-grid metric-grid--four" aria-label="Ringkasan Analytics">
      <MetricCell label="Pengiriman aktif" value={metric(value.active_shipments)} detail="Belum ditutup atau dikirim" />
      <MetricCell label="Kasus baru" value={metric(value.assessments)} detail={`Dibuat dalam ${days} hari terakhir`} />
      <MetricCell label="Pengecualian terbuka" value={metric(value.open_exceptions)} detail="Belum diselesaikan" />
      <MetricCell label="Pekerjaan terlambat" value={metric(value.overdue_work)} detail="Melewati due date" />
    </section>

    <section className="data-panel data-panel--wide chart-panel cf-analytics-chart">
      <div className="data-panel__header"><div><h2>Aktivitas operasional</h2><p>Peristiwa tersimpan per hari untuk rentang dan kelompok yang dipilih.</p></div><span className="cf-metadata">Workspace saat ini · {days} hari</span></div>
      <AssuranceTimeseries data={chartSeries} label="Aktivitas operasional" isLoading={series.isLoading} error={series.error instanceof Error ? series.error.message : null} />
    </section>

    <section className="cf-analytics-summary-grid">
      <div className="cf-summary-block"><p className="cf-label">Keputusan release</p><p className="cf-summary-block__value">{metric(value.release_authorized)}</p><p className="cf-metadata">Pengiriman dengan status RELEASE AUTHORIZED saat ini.</p></div>
      <div className="cf-summary-block"><p className="cf-label">Perhatian operasional</p><p className="cf-summary-block__value">{metric(value.overdue_work)}</p><p className="cf-metadata">Pengecualian terbuka yang melewati due date dan perlu triage.</p></div>
      <div className="cf-summary-block"><p className="cf-label">Batas interpretasi</p><p className="cf-summary-block__value">Faktual</p><p className="cf-metadata">Tidak ada tren, prediksi, atau kualitas provider yang diinferensikan dari data ini.</p></div>
    </section>

    <section className="cf-breakdown-grid" aria-label="Breakdown Analytics">
      <BreakdownPanel title="Hasil assurance" description="Check assurance yang dibuat pada rentang ini." items={breakdowns.assurance_status || []} />
      <BreakdownPanel title="Pemrosesan dokumen" description="Status ekstraksi untuk versi dokumen yang diunggah pada rentang ini." items={breakdowns.document_extraction || []} />
      <BreakdownPanel title="Severity pengecualian" description="Pengecualian yang dibuat pada rentang ini." items={breakdowns.exception_severity || []} />
      <BreakdownPanel title="Screening" description="Hasil screening yang tercatat pada rentang ini." items={breakdowns.screening_result || []} />
    </section>
  </div>;
}
