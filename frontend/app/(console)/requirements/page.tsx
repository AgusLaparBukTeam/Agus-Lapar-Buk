"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ClipboardTextIcon as ClipboardText } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { MetricCell, OperationalState } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState, FilterBar, MetricsHeader } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { fetchOperationsList } from "@/lib/api";

type Row = Record<string, unknown>;
function object(value: unknown) { return (value && typeof value === "object" ? value : {}) as Row; }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "—"; }

export default function RequirementsPage() {
  const [resultFilter, setResultFilter] = useState("");
  const result = useQuery({ queryKey: ["requirements"], queryFn: () => fetchOperationsList("/requirements") });
  const all = useMemo(() => result.data?.items ?? [], [result.data?.items]);
  const rows = useMemo(() => all.filter((row) => !resultFilter || String(object(row.evaluation).result) === resultFilter), [all, resultFilter]);
  const applicable = all.filter((row) => object(row.evaluation).applicable !== false).length;
  const review = all.filter((row) => ["REVIEW", "HOLD", "FAILED"].includes(String(object(row.evaluation).result))).length;
  return <CloudflarePageShell className="cf-requirements-page"><PageHeader icon={ClipboardText} title="Persyaratan" description="Bandingkan evidence pengiriman dengan persyaratan yang berlaku dan sumber rule yang tercatat." /><FilterBar label="Filter persyaratan"><AppSelect ariaLabel="Filter hasil persyaratan" value={resultFilter} onValueChange={setResultFilter} options={[{ value: "", label: "Semua hasil" }, { value: "CLEAR", label: "CLEAR" }, { value: "REVIEW", label: "REVIEW" }, { value: "HOLD", label: "HOLD" }, { value: "NOT_APPLICABLE", label: "Tidak berlaku" }]} /><span className="cf-metadata">{rows.length} evaluasi</span></FilterBar>{result.isPending ? <div className="page-loading">Memuat persyaratan…</div> : result.isError ? <div role="alert" className="notice notice--danger">Matriks persyaratan tidak tersedia saat ini.</div> : <><MetricsHeader className="cf-requirements-summary" label="Ringkasan persyaratan"><MetricCell label="Evaluasi" value={all.length} detail="Record yang tersedia" /><MetricCell label="Berlaku" value={applicable} detail="Bukan NOT_APPLICABLE" /><MetricCell label="Butuh perhatian" value={review} detail="REVIEW, HOLD, atau FAILED" /></MetricsHeader><DataTableSurface title="Requirement matrix" description="Status dan alasan berasal dari evaluasi yang tersimpan; tidak ada keputusan baru yang diturunkan di frontend.">{rows.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Persyaratan</Table.Head><Table.Head>Pengiriman</Table.Head><Table.Head>Dokumen</Table.Head><Table.Head>Sumber</Table.Head><Table.Head>Versi</Table.Head><Table.Head>Berlaku</Table.Head><Table.Head>Hasil</Table.Head><Table.Head>Evaluasi</Table.Head><Table.Head><span className="sr-only">Aksi</span></Table.Head></Table.Row></Table.Header><Table.Body>{rows.map((row) => { const requirement = object(row.requirement); const evaluation = object(row.evaluation); return <Table.Row key={String(evaluation.id || requirement.id)}><Table.Cell><span className="table-cell-primary">{String(requirement.name || "—")}</span><small>{String(requirement.description || "")}</small></Table.Cell><Table.Cell>{String(row.shipment_reference || "—")}</Table.Cell><Table.Cell>{String(requirement.document_type || "—")}</Table.Cell><Table.Cell>{String(requirement.source || evaluation.source || "—")}</Table.Cell><Table.Cell>{String(requirement.version || evaluation.rule_version || "—")}</Table.Cell><Table.Cell>{evaluation.applicable === false ? "Tidak" : "Ya"}</Table.Cell><Table.Cell><OperationalState value={String(evaluation.result || "REVIEW")} /></Table.Cell><Table.Cell>{date(evaluation.evaluated_at)}</Table.Cell><Table.Cell>{evaluation.shipment_id ? <ActionLink href={`/shipments/${String(evaluation.shipment_id)}`} variant="ghost">Buka</ActionLink> : <span className="cf-metadata">—</span>}</Table.Cell></Table.Row>; })}</Table.Body></Table></div> : <EmptyState icon={<ClipboardText size={20} />} title="Belum ada evaluasi persyaratan" description="Evaluasi akan muncul setelah evidence diproses pada pengiriman." />}</DataTableSurface></>}</CloudflarePageShell>;
}
