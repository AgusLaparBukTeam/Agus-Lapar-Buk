"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { fetchOperationsList } from "@/lib/api";

type Row = Record<string, unknown>;
function details(value: unknown) { return (value && typeof value === "object" ? value : {}) as Row; }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "—"; }

export default function AssurancePage() {
  const [status, setStatus] = useState("");
  const [checkType, setCheckType] = useState("");
  const result = useQuery({ queryKey: ["assurance", status, checkType], queryFn: () => fetchOperationsList("/assurance", { ...(status ? { status } : {}), ...(checkType ? { check_type: checkType } : {}) }) });
  const rows = result.data?.items || [];
  return <CloudflarePageShell className="cf-assurance-page"><PageHeader icon={ShieldCheck} title="Pemeriksaan jaminan" description="Tinjau check yang mendukung atau menahan keputusan pelepasan berdasarkan sumber dan bukti yang tersimpan." /><FilterBar label="Filter pemeriksaan jaminan"><AppSelect ariaLabel="Filter status check" value={status} onValueChange={setStatus} options={[{ value: "", label: "Semua status" }, { value: "CLEAR", label: "CLEAR" }, { value: "REVIEW", label: "REVIEW" }, { value: "HOLD", label: "HOLD" }, { value: "FAILED", label: "FAILED" }]} /><AppSelect ariaLabel="Filter jenis check" value={checkType} onValueChange={setCheckType} options={[{ value: "", label: "Semua check" }, { value: "PARTY_SCREENING", label: "Party screening" }, { value: "DOCUMENT", label: "Document" }, { value: "DANGEROUS_GOODS", label: "Dangerous goods" }]} /><span className="cf-metadata">{rows.length} check</span></FilterBar>{result.isPending ? <div className="page-loading">Memuat pemeriksaan jaminan…</div> : result.isError ? <div role="alert" className="notice notice--danger">Pemeriksaan jaminan tidak tersedia saat ini.</div> : <DataTableSurface title="Compliance checks" description="CLEAR, REVIEW, HOLD, dan FAILED adalah status operasional yang berbeda; warna tidak menggantikan teks status.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Check</Table.Head><Table.Head>Kategori</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Status</Table.Head><Table.Head>Severity</Table.Head><Table.Head>Bukti</Table.Head><Table.Head>Sumber</Table.Head><Table.Head>Dievaluasi</Table.Head><Table.Head>Relevansi keputusan</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const detail = details(row.details); const evidence = detail.evidence ?? detail.evidence_count ?? "—"; const relevance = detail.decision_relevance ?? detail.release_relevance ?? "—"; return <Table.Row key={String(row.id)}><Table.Cell><span className="table-cell-primary">{String(row.check_type || "—")}</span></Table.Cell><Table.Cell>{String(detail.category || "—")}</Table.Cell><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell><OperationalState value={String(row.status || "REVIEW")} /></Table.Cell><Table.Cell><OperationalState value={String(row.severity || "—")} /></Table.Cell><Table.Cell>{typeof evidence === "string" || typeof evidence === "number" ? String(evidence) : "Tersedia"}</Table.Cell><Table.Cell>{String(row.source || "—")}</Table.Cell><Table.Cell>{date(row.completed_at)}</Table.Cell><Table.Cell>{typeof relevance === "string" ? relevance : "Tersedia"}</Table.Cell><Table.Cell>{row.shipment_id ? <ActionLink href={`/shipments/${String(row.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<ShieldCheck size={20} />} title="Belum ada check" description="Check akan muncul setelah assessment atau screening dijalankan." />}</DataTableSurface>}</CloudflarePageShell>;
}
