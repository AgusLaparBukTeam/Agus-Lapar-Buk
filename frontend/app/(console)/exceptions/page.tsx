"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { CaretDownIcon as CaretDown, CaretRightIcon as CaretRight, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { fetchOperationsList, updateException } from "@/lib/api";

type Row = Record<string, unknown>;
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "—"; }

export default function ExceptionsPage() {
  const [status, setStatus] = useState("OPEN");
  const [mine, setMine] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["exceptions", status, mine], queryFn: () => fetchOperationsList("/exceptions", { ...(status ? { status } : {}), ...(mine ? { mine: "true" } : {}) }) });
  const mutation = useMutation({ mutationFn: (value: { id: string; status: string }) => updateException(value.id, { status: value.status }), onSuccess: () => client.invalidateQueries({ queryKey: ["exceptions"] }) });
  const rows = result.data?.items || [];
  return <CloudflarePageShell className="cf-exceptions-page"><PageHeader icon={WarningCircle} title="Pengecualian" description="Kelompokkan dan selesaikan temuan yang menghambat pengiriman dengan alasan dan tindakan yang terdokumentasi." /><FilterBar label="Filter pengecualian"><AppSelect ariaLabel="Filter status pengecualian" value={status} onValueChange={setStatus} options={[{ value: "OPEN", label: "Terbuka" }, { value: "IN_PROGRESS", label: "Sedang ditangani" }, { value: "RESOLVED", label: "Selesai" }, { value: "", label: "Semua status" }]} /><Button variant={mine ? "primary" : "secondary"} size="sm" onClick={() => setMine((value) => !value)}>{mine ? "Tugas saya" : "Semua penanggung jawab"}</Button><span className="cf-metadata">{rows.length} temuan</span></FilterBar>{result.isPending ? <div className="page-loading">Memuat pengecualian…</div> : result.isError ? <div role="alert" className="notice notice--danger">Pengecualian tidak tersedia saat ini.</div> : <DataTableSurface title="Diagnostik terbuka" description="Buka baris untuk melihat konteks dan alasan sebelum memperbarui status.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Severity</Table.Head><Table.Head>Alasan</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Status</Table.Head><Table.Head>Penanggung jawab</Table.Head><Table.Head>Dibuat</Table.Head><Table.Head><span className="sr-only">Detail</span></Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const id = String(row.id); const open = expanded === id; return <><Table.Row key={id}><Table.Cell><OperationalState value={String(row.severity || "—")} /></Table.Cell><Table.Cell><span className="table-cell-primary">{String(row.summary || "—")}</span></Table.Cell><Table.Cell>{row.shipment_id ? <Link className="table-link" href={`/shipments/${String(row.shipment_id)}`}>{String(row.shipment_reference || "Pengiriman")}</Link> : String(row.shipment_reference || "—")}</Table.Cell><Table.Cell><OperationalState value={String(row.status || "OPEN")} /></Table.Cell><Table.Cell>{String(row.assigned_to || "Belum ditugaskan")}</Table.Cell><Table.Cell>{date(row.created_at)}</Table.Cell><Table.Cell><Button variant="ghost" size="sm" shape="square" aria-label={open ? "Tutup detail pengecualian" : "Buka detail pengecualian"} onClick={() => setExpanded(open ? null : id)}>{open ? <CaretDown size={15} /> : <CaretRight size={15} />}</Button></Table.Cell><Table.Cell>{String(row.status) === "OPEN" ? <Button variant="secondary" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ id, status: "IN_PROGRESS" })}>Mulai</Button> : String(row.status) === "IN_PROGRESS" ? <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate({ id, status: "RESOLVED" })}>Selesaikan</Button> : <span className="cf-metadata">Selesai</span>}</Table.Cell></Table.Row>{open && <Table.Row key={`${id}-detail`}><Table.Cell colSpan={8}><div className="cf-diagnostic-detail"><div><span>Objek terdampak</span><strong>{String(row.impacted_object || row.shipment_reference || "Pengiriman")}</strong></div><div><span>Jatuh tempo</span><strong>{date(row.due_at)}</strong></div><div><span>Catatan resolusi</span><strong>{String(row.resolution_note || "Belum ada catatan resolusi.")}</strong></div></div></Table.Cell></Table.Row>}</>; })}</Table.Body></Table></div> : <EmptyState icon={<WarningCircle size={20} />} title="Tidak ada pengecualian pada tampilan ini" description="Temuan baru akan tampil ketika assessment membutuhkan resolusi." />}</DataTableSurface>}</CloudflarePageShell>;
}
