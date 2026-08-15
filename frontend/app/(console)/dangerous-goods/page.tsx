"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { WarningOctagonIcon as WarningOctagon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { fetchOperationsList } from "@/lib/api";

type Row = Record<string, unknown>;
function item(value: unknown) { return (value && typeof value === "object" ? value : {}) as Row; }

export default function DangerousGoodsPage() {
  const result = useQuery({ queryKey: ["dangerous-goods"], queryFn: () => fetchOperationsList("/dangerous-goods") });
  const rows = result.data?.items || [];
  return <CloudflarePageShell className="cf-dangerous-goods-page"><PageHeader icon={WarningOctagon} title="Dangerous goods" description="Tinjau informasi barang berbahaya dan assurance status yang ditetapkan backend sebelum keputusan pelepasan." />{result.isPending ? <div className="page-loading">Memuat dangerous goods…</div> : result.isError ? <div role="alert" className="notice notice--danger">Register dangerous goods tidak tersedia saat ini.</div> : <DataTableSurface title="Dangerous goods assurance" description="Status assurance berasal dari backend. Frontend tidak membentuk hasil kepatuhan kedua.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Pengiriman</Table.Head><Table.Head>Barang</Table.Head><Table.Head>UN number</Table.Head><Table.Head>Proper shipping name</Table.Head><Table.Head>Hazard class</Table.Head><Table.Head>Packing group</Table.Head><Table.Head>Jumlah</Table.Head><Table.Head>Assurance</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const data = item(row.item); return <Table.Row key={String(data.id || row.id)}><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell><span className="table-cell-primary">{String(data.description || "—")}</span><small>{String(data.sku || "")}</small></Table.Cell><Table.Cell>{String(data.un_number || "—")}</Table.Cell><Table.Cell>{String(data.proper_shipping_name || "—")}</Table.Cell><Table.Cell>{String(data.hazard_class || "—")}</Table.Cell><Table.Cell>{String(data.packing_group || "—")}</Table.Cell><Table.Cell>{String(data.quantity || "—")} {String(data.unit_of_measure || "")}</Table.Cell><Table.Cell><OperationalState value={String(row.assurance || "REVIEW")} /></Table.Cell><Table.Cell>{data.shipment_id ? <ActionLink href={`/shipments/${String(data.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<WarningOctagon size={20} />} title="Tidak ada dangerous goods" description="Barang yang ditandai dangerous goods akan tampil di sini." />}</DataTableSurface>}</CloudflarePageShell>;
}
