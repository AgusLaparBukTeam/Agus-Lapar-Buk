"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { MagnifyingGlassIcon as MagnifyingGlass, UsersThreeIcon as UsersThree } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { fetchOperationsList } from "@/lib/api";

type Row = Record<string, unknown>;

export default function PartiesPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const result = useQuery({ queryKey: ["parties", deferredQuery], queryFn: () => fetchOperationsList("/parties", deferredQuery ? { q: deferredQuery } : undefined) });
  const rows = result.data?.items || [];
  const notConfigured = rows.some((row) => String(row.screening) === "Not configured");
  return <CloudflarePageShell className="cf-parties-page"><PageHeader icon={UsersThree} title="Pihak terkait" description="Tinjau entitas perdagangan yang berhubungan dengan pengiriman dan status screening yang tercatat." /><FilterBar label="Cari pihak terkait"><div className="operations-search"><MagnifyingGlass size={16} aria-hidden="true" /><Input className="operations-search__input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama legal atau identifier" aria-label="Cari pihak terkait" /><span className="cf-metadata">{rows.length} entitas</span></div></FilterBar>{result.isPending ? <div className="page-loading">Memuat pihak terkait…</div> : result.isError ? <div role="alert" className="notice notice--danger">Daftar pihak terkait tidak tersedia saat ini.</div> : <>{notConfigured && <StateNotice tone="warning" title="Screening belum dikonfigurasi">Status ini bukan hasil CLEAR dan tidak menunjukkan cakupan screening. Konfigurasi provider diperlukan sebelum hasil screening dapat dibuat.</StateNotice>}<DataTableSurface title="Entity register" description="Peran dan identifier ditampilkan dari record pihak yang tersimpan.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Entitas</Table.Head><Table.Head>Peran</Table.Head><Table.Head>Negara</Table.Head><Table.Head>Identifier</Table.Head><Table.Head>Screening</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => <Table.Row key={String(row.id)}><Table.Cell><span className="table-cell-primary">{String(row.legal_name || "—")}</span><small>{String(row.trade_name || "")}</small></Table.Cell><Table.Cell>{String(row.role || "—")}</Table.Cell><Table.Cell>{String(row.country_code || "—")}</Table.Cell><Table.Cell>{String(row.external_identifier || row.tax_identifier || "—")}</Table.Cell><Table.Cell><OperationalState value={String(row.screening || "NOT_CONFIGURED")} /></Table.Cell><Table.Cell>{String(row.shipment_count || 0)}</Table.Cell><Table.Cell>{row.shipment_id ? <ActionLink href={`/shipments/${String(row.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>)}</Table.Body></Table></div> : <EmptyState icon={<UsersThree size={20} />} title="Belum ada pihak terkait" description="Pihak akan tampil ketika direkam pada pengiriman." />}</DataTableSurface></>}</CloudflarePageShell>;
}
