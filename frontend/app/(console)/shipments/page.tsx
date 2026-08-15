"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { MagnifyingGlassIcon as MagnifyingGlass, PackageIcon as Package, PlusIcon as Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ActionLink, Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { fetchShipments } from "@/lib/api";
import type { ShipmentStatus } from "@/lib/types";

const statusLabels: Record<ShipmentStatus, string> = {
  DRAFT: "Draf",
  DOCUMENTS_REQUIRED: "Dokumen diperlukan",
  REVIEW_REQUIRED: "Perlu review",
  HOLD: "HOLD",
  RELEASE_AUTHORIZED: "Pelepasan diizinkan",
  RELEASE_INVALIDATED: "Pelepasan perlu review",
  DISPATCHED: "Dikirim",
  CLOSED: "Ditutup",
};

const statusVariant: Record<ShipmentStatus, "neutral" | "warning" | "error" | "success"> = {
  DRAFT: "neutral",
  DOCUMENTS_REQUIRED: "warning",
  REVIEW_REQUIRED: "warning",
  HOLD: "error",
  RELEASE_AUTHORIZED: "success",
  RELEASE_INVALIDATED: "warning",
  DISPATCHED: "success",
  CLOSED: "neutral",
};

function ShipmentState({ status }: { status: ShipmentStatus }) {
  return <Badge appearance="dot" variant={statusVariant[status]}>{statusLabels[status]}</Badge>;
}

export default function ShipmentsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const deferredQuery = useDeferredValue(query);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), page_size: "50" });
    if (deferredQuery) value.set("query", deferredQuery);
    if (status) value.set("status", status);
    return value;
  }, [deferredQuery, page, status]);
  const result = useQuery({ queryKey: ["shipments", params.toString()], queryFn: () => fetchShipments(params) });

  return <CloudflarePageShell className="operations-page shipments-page">
    <PageHeader icon={Package} title="Pengiriman" description="Buat kasus pengiriman, bandingkan dokumennya, dan kelola keputusan pelepasan dari satu tempat." actions={<ActionLink href="/shipments/new" icon={Plus}>Buat pengiriman</ActionLink>} />
    <FilterBar className="shipments-toolbar" label="Filter pengiriman">
      <div className="operations-search">
        <MagnifyingGlass size={16} aria-hidden="true" />
        <Input className="operations-search__input" value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Cari referensi atau tujuan pengiriman" aria-label="Cari pengiriman" />
        {result.data && <span className="cf-metadata">{result.data.total} hasil</span>}
      </div>
      <AppSelect ariaLabel="Filter status pengiriman" value={status} onValueChange={(nextStatus) => { setPage(1); setStatus(nextStatus); }} options={[{ value: "", label: "Semua status" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
    </FilterBar>
    {result.isPending ? <div className="page-loading">Memuat pengiriman…</div> : result.isError ? <div role="alert" className="notice notice--danger">Daftar pengiriman tidak tersedia saat ini.</div> : <DataTableSurface title="Daftar pengiriman" description={`${result.data.total} kasus pengiriman di ruang kerja ini.`}>
      {result.data.items.length === 0 ? <EmptyState icon={<Package size={22} />} title="Belum ada pengiriman" description="Buat kasus pengiriman pertama untuk memulai pemeriksaan dokumen." action={<ActionLink href="/shipments/new">Buat pengiriman</ActionLink>} /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Referensi</Table.Head><Table.Head>Rute</Table.Head><Table.Head>Moda</Table.Head><Table.Head>Jaminan</Table.Head><Table.Head>Pemeriksaan terbuka</Table.Head><Table.Head>Diperbarui</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{result.data.items.map((shipment) => <Table.Row key={shipment.id}><Table.Cell><Link className="table-link" href={`/shipments/${shipment.id}`}>{shipment.internal_reference}</Link><small>{shipment.external_reference || "Tidak ada referensi eksternal"}</small></Table.Cell><Table.Cell>{shipment.origin} <span aria-hidden="true">→</span> {shipment.destination}</Table.Cell><Table.Cell>{shipment.transport_mode}</Table.Cell><Table.Cell><ShipmentState status={shipment.status} /><small>Risiko {shipment.risk_level.toLowerCase()}</small></Table.Cell><Table.Cell>{shipment.open_tasks}</Table.Cell><Table.Cell>{new Date(shipment.updated_at).toLocaleString("id-ID")}</Table.Cell><Table.Cell><ActionLink href={`/shipments/${shipment.id}`} variant="ghost">Buka</ActionLink></Table.Cell></Table.Row>)}</Table.Body></Table></div>}
    </DataTableSurface>}
    {result.data && <div className="pagination-row"><span className="muted-label">{result.data.total} hasil</span><div className="pagination-actions"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><Button variant="secondary" size="sm" disabled={page * result.data.page_size >= result.data.total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
  </CloudflarePageShell>;
}
