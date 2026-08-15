"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { PackageIcon as Cube, MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { fetchOperationsList } from "@/lib/api";

export default function ProductsPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const result = useQuery({ queryKey: ["products", deferredQuery], queryFn: () => fetchOperationsList("/products", deferredQuery ? { q: deferredQuery } : undefined) });
  const rows = result.data?.items || [];
  return <CloudflarePageShell className="cf-products-page"><PageHeader icon={Cube} title="Produk dan komoditas" description="Tinjau barang yang tercatat dalam pengiriman, termasuk klasifikasi dan keterkaitan dangerous goods." /><FilterBar label="Cari produk"><div className="operations-search"><MagnifyingGlass size={16} aria-hidden="true" /><Input className="operations-search__input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari SKU, deskripsi, atau HS code" aria-label="Cari produk" /><span className="cf-metadata">{rows.length} komoditas</span></div></FilterBar>{result.isPending ? <div className="page-loading">Memuat komoditas…</div> : result.isError ? <div role="alert" className="notice notice--danger">Daftar komoditas tidak tersedia saat ini.</div> : <DataTableSurface title="Register komoditas" description="Nilai di bawah ini berasal dari item pengiriman yang tersimpan.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Produk</Table.Head><Table.Head>Klasifikasi</Table.Head><Table.Head>Deskripsi</Table.Head><Table.Head>Dangerous goods</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Review</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const dangerous = Boolean(row.dangerous_goods); return <Table.Row key={String(row.id)}><Table.Cell><span className="table-cell-primary">{String(row.sku || "Tanpa SKU")}</span><small>{String(row.quantity || "—")} {String(row.unit_of_measure || "")}</small></Table.Cell><Table.Cell>{String(row.hs_code || "—")}</Table.Cell><Table.Cell>{String(row.description || "—")}</Table.Cell><Table.Cell>{dangerous ? <OperationalState value="REVIEW" /> : <span className="cf-metadata">Tidak ditandai</span>}</Table.Cell><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell><OperationalState value={dangerous && (!row.un_number || !row.proper_shipping_name || !row.hazard_class) ? "REVIEW" : "CLEAR"} /></Table.Cell><Table.Cell>{row.shipment_id ? <ActionLink href={`/shipments/${String(row.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<Cube size={20} />} title="Belum ada komoditas" description="Komoditas akan tampil setelah dicatat pada pengiriman." />}</DataTableSurface>}</CloudflarePageShell>;
}
