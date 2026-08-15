"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { WarningCircleIcon as ShieldWarning } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { fetchOperationsList } from "@/lib/api";

type Row = Record<string, unknown>;
function run(value: unknown) { return (value && typeof value === "object" ? value : {}) as Row; }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "—"; }

export default function ScreeningPage() {
  const result = useQuery({ queryKey: ["screening"], queryFn: () => fetchOperationsList("/screening") });
  const rows = useMemo(() => result.data?.items ?? [], [result.data?.items]);
  const notConfigured = rows.some((row) => String(run(row.run).provider) === "NOT_CONFIGURED" || String(run(row.run).result) === "NOT_CONFIGURED");
  return <CloudflarePageShell className="cf-screening-page"><PageHeader icon={ShieldWarning} title="Screening pihak" description="Tinjau provider state dan hasil screening yang tercatat untuk pihak terkait pada pengiriman." />{result.isPending ? <div className="page-loading">Memuat hasil screening…</div> : result.isError ? <div role="alert" className="notice notice--danger">Hasil screening tidak tersedia saat ini.</div> : <>{notConfigured && <StateNotice tone="warning" title="Provider screening belum dikonfigurasi">NOT_CONFIGURED menciptakan review assurance dengan severity tinggi. Ini bukan NOT_APPLICABLE dan tidak berarti pihak telah lolos screening.</StateNotice>}<DataTableSurface title="Screening results" description="Hasil, provider, dan waktu diambil langsung dari screening run yang tersimpan.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Entitas</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Hasil</Table.Head><Table.Head>Provider</Table.Head><Table.Head>Review</Table.Head><Table.Head>Skor</Table.Head><Table.Head>Waktu</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const item = run(row.run); const configured = String(item.provider) !== "NOT_CONFIGURED"; return <Table.Row key={String(item.id || row.id)}><Table.Cell><span className="table-cell-primary">{String(row.party || "—")}</span></Table.Cell><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell><OperationalState value={String(item.result || "NOT_CONFIGURED")} /></Table.Cell><Table.Cell>{String(item.provider || "NOT_CONFIGURED")}</Table.Cell><Table.Cell><OperationalState value={configured ? String(item.review_status || item.result || "REVIEW") : "REVIEW"} /></Table.Cell><Table.Cell>{item.score === null || item.score === undefined ? "—" : String(item.score)}</Table.Cell><Table.Cell>{date(item.screened_at)}</Table.Cell><Table.Cell>{item.shipment_id ? <ActionLink href={`/shipments/${String(item.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<ShieldWarning size={20} />} title="Belum ada screening run" description="Screening akan tampil setelah dijalankan untuk pihak pada pengiriman." />}</DataTableSurface></>}</CloudflarePageShell>;
}
