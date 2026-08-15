"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { MagnifyingGlassIcon as MagnifyingGlass, PackageIcon as Truck } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { fetchOperationsList } from "@/lib/api";

function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "—"; }
function reference(row: Record<string, unknown>) { return String(row.voyage || row.flight || row.vehicle_reference || row.vessel || "—"); }

export default function TransportPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const result = useQuery({ queryKey: ["transport", deferredQuery], queryFn: () => fetchOperationsList("/transport", deferredQuery ? { q: deferredQuery } : undefined) });
  const rows = result.data?.items || [];
  return <CloudflarePageShell className="cf-transport-page"><PageHeader icon={Truck} title="Transportasi" description="Tinjau leg pergerakan yang tersimpan untuk pengiriman tanpa menyiratkan pelacakan real-time." /><FilterBar label="Cari transportasi"><div className="operations-search"><MagnifyingGlass size={16} aria-hidden="true" /><Input className="operations-search__input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari carrier, rute, atau reference" aria-label="Cari transportasi" /><span className="cf-metadata">{rows.length} leg</span></div></FilterBar>{result.isPending ? <div className="page-loading">Memuat transportasi…</div> : result.isError ? <div role="alert" className="notice notice--danger">Register transportasi tidak tersedia saat ini.</div> : <DataTableSurface title="Movement register" description="Jadwal diambil dari leg transportasi yang direkam pada pengiriman.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Moda</Table.Head><Table.Head>Carrier</Table.Head><Table.Head>Rute</Table.Head><Table.Head>Reference</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Jadwal tiba</Table.Head><Table.Head>State</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const state = row.actual_arrival ? "COMPLETED" : row.actual_departure ? "IN_PROGRESS" : row.planned_departure ? "PLANNED" : "REVIEW"; return <Table.Row key={String(row.id)}><Table.Cell><span className="table-cell-primary">{String(row.mode || "—")}</span><small>Leg {String(row.sequence || "—")}</small></Table.Cell><Table.Cell>{String(row.carrier || "—")}</Table.Cell><Table.Cell>{String(row.origin || "—")} → {String(row.destination || "—")}</Table.Cell><Table.Cell>{reference(row)}</Table.Cell><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell>{date(row.planned_arrival || row.actual_arrival)}</Table.Cell><Table.Cell><OperationalState value={state} /></Table.Cell><Table.Cell>{row.shipment_id ? <ActionLink href={`/shipments/${String(row.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<Truck size={20} />} title="Belum ada leg transportasi" description="Leg transportasi akan tampil ketika direkam pada pengiriman." />}</DataTableSurface>}</CloudflarePageShell>;
}
