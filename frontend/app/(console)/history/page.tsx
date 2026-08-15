"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchHistory } from "@/lib/api";

export default function HistoryPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), page_size: "20" });
    if (status) value.set("status", status);
    if (deferredQuery) value.set("query", deferredQuery);
    return value;
  }, [deferredQuery, page, status]);
  const result = useQuery({ queryKey: ["history", params.toString()], queryFn: () => fetchHistory(params) });

  return <div>
    <PageHeader icon={ClockCounterClockwise} title="Riwayat pemeriksaan" description="Cari pemeriksaan dokumen sebelumnya dan tinjau evidence tanpa mengunggah file kembali." />
    <div className="filter-bar">
      <Input aria-label="Cari pengiriman atau dokumen" placeholder="Cari referensi pengiriman atau dokumen" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} className="filter-search" />
      <AppSelect ariaLabel="Filter status" value={status} onValueChange={(nextStatus) => { setPage(1); setStatus(nextStatus); }} options={[{ value: "", label: "Semua keputusan" }, { value: "CLEAR", label: "Siap dilepas" }, { value: "REVIEW", label: "Perlu tinjauan" }, { value: "HOLD", label: "Ditahan" }]} />
    </div>
    {result.isError && <div role="alert" className="notice notice--danger">Riwayat pemeriksaan belum dapat dimuat.</div>}
    <section className="data-panel data-panel--wide">
      {result.isPending ? <p className="page-loading">Memuat riwayat pemeriksaan…</p> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Waktu</Table.Head><Table.Head>Pengiriman / dokumen</Table.Head><Table.Head>Keputusan sistem</Table.Head><Table.Head>Keputusan akhir</Table.Head><Table.Head>Temuan</Table.Head><Table.Head>Pemrosesan</Table.Head></Table.Row></Table.Header><Table.Body>{result.data?.items.map((item) => <Table.Row key={item.session_id}><Table.Cell>{new Date(item.created_at).toLocaleString("id-ID")}</Table.Cell><Table.Cell><Link className="table-link" href={`/history/${item.session_id}`}>{String(item.documents.delivery_order?.shipment_id.value || item.session_id.slice(0, 8))}</Link><small>{String(item.documents.delivery_order?.document_id.value || "Tidak ada referensi dokumen")}</small></Table.Cell><Table.Cell><StatusBadge status={item.status} /></Table.Cell><Table.Cell><StatusBadge status={item.effective_status} /></Table.Cell><Table.Cell>{item.mismatches.length}</Table.Cell><Table.Cell>{item.processing_ms} ms</Table.Cell></Table.Row>)}</Table.Body></Table></div>}
    </section>
    {result.data && <div className="pagination-row"><span className="muted-label">{result.data.total} hasil</span><div className="pagination-actions"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><Button variant="secondary" size="sm" disabled={page * result.data.page_size >= result.data.total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
  </div>;
}
