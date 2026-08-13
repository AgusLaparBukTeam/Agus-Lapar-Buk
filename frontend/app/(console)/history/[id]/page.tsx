"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ArrowLeftIcon as ArrowLeft, FileTextIcon as FileText } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fetchReconciliation } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DocumentType } from "@/lib/types";

const labels: Record<DocumentType, string> = { delivery_order: "Delivery order", invoice: "Invoice", packing_list: "Packing list" };

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const result = useQuery({ queryKey: ["reconciliation", id], queryFn: () => fetchReconciliation(id) });
  if (result.isPending) return <div className="page-loading">Loading check…</div>;
  if (result.isError || !result.data) return <div role="alert" className="notice notice--danger">This document check could not be loaded.</div>;
  const item = result.data;
  return <div><Link href="/history" className="back-link"><ArrowLeft size={15} /> Back to check history</Link><PageHeader icon={FileText} title="Check result" description={item.reason} actions={<StatusBadge status={item.effective_status} />} /><div className="detail-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Decision record</h2><p>The current decision and the next step for this shipment.</p></div></div><dl className="detail-list"><div><dt>Initial decision</dt><dd>{item.audit.system_decision}</dd></div><div><dt>Current decision</dt><dd>{item.effective_status}</dd></div><div><dt>Recommended next step</dt><dd>{item.recommended_action}</dd></div><div><dt>Completed</dt><dd>{new Date(item.created_at).toLocaleString("en-GB")}</dd></div></dl></section><section className="data-panel"><div className="data-panel__header"><div><h2>Findings</h2><p>Differences that affected the decision.</p></div></div>{item.mismatches.length === 0 ? <p className="empty-copy">No material differences were found.</p> : <div className="space-y-4">{item.mismatches.map((mismatch) => <article key={mismatch.id}><div className="flex items-center justify-between gap-3"><strong>{mismatch.type.replaceAll("_", " ")}</strong><span className="shipment-state shipment-state--high">{mismatch.severity}</span></div><p className="mt-1 text-sm text-[var(--text-subtle)]">{mismatch.explanation}</p></article>)}</div>}</section></div><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Document details</h2><p>Information read from each uploaded document.</p></div></div><div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Document</Table.Head><Table.Head>Document reference</Table.Head><Table.Head>Shipment reference</Table.Head><Table.Head>Recipient</Table.Head><Table.Head>Readability</Table.Head></Table.Row></Table.Header><Table.Body>{(Object.entries(item.documents) as [DocumentType, typeof item.documents[DocumentType]][]).map(([type, doc]) => <Table.Row key={type}><Table.Cell>{labels[type]}</Table.Cell><Table.Cell>{String(doc.document_id.value || "Not provided")}</Table.Cell><Table.Cell>{String(doc.shipment_id.value || "Not provided")}</Table.Cell><Table.Cell>{String(doc.recipient.value || "Not provided")}</Table.Cell><Table.Cell>{Math.round(doc.document_type_confidence * 100)}%</Table.Cell></Table.Row>)}</Table.Body></Table></div></section>{item.audit.override_history.length > 0 && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Decision updates</h2><p>Supervisor changes recorded with their reason.</p></div></div><div className="space-y-3">{item.audit.override_history.map((event) => <div key={event.id} className="border-l-2 border-blue-500 pl-4 text-sm"><strong>{event.previous_decision} → {event.final_decision}</strong><p className="mt-1 text-[var(--text-subtle)]">{event.reason}</p><small className="text-[var(--text-subtle)]">{event.actor} · {new Date(event.created_at).toLocaleString("en-GB")}</small></div>)}</div></section>}</div>;
}
