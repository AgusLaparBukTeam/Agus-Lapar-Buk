"use client";

import { ArrowLeft, CheckCircle, FileText, Package, ShieldCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { decideRelease, fetchMe, fetchShipment } from "@/lib/api";
import type { ShipmentStatus } from "@/lib/types";

const labels: Record<ShipmentStatus, string> = { DRAFT: "Draft", DOCUMENTS_REQUIRED: "Documents needed", REVIEW_REQUIRED: "Needs review", HOLD: "On hold", RELEASE_AUTHORIZED: "Release authorized", RELEASE_INVALIDATED: "Release needs review", DISPATCHED: "Dispatched", CLOSED: "Closed" };
function State({ status }: { status: ShipmentStatus }) { return <span className={`shipment-state shipment-state--${status.toLowerCase()}`}>{labels[status]}</span>; }

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const shipment = useQuery({ queryKey: ["shipment", id], queryFn: () => fetchShipment(id) });
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const decision = useMutation({ mutationFn: (value: "AUTHORIZE" | "HOLD") => decideRelease(id, { decision: value, reason }), onSuccess: () => { setReason(""); client.invalidateQueries({ queryKey: ["shipment", id] }); client.invalidateQueries({ queryKey: ["work-queue"] }); } });
  if (shipment.isPending) return <div className="page-loading">Loading shipment…</div>;
  if (shipment.isError || !shipment.data) return <div role="alert" className="notice notice--danger">This shipment could not be loaded.</div>;
  const item = shipment.data;
  const canDecide = me.data?.role === "admin" || me.data?.role === "supervisor";
  return <div>
    <Link className="back-link" href="/shipments"><ArrowLeft size={15} /> Back to shipments</Link>
    <PageHeader icon={Package} title={item.internal_reference} description={`${item.origin} to ${item.destination}`} actions={<State status={item.status} />} />
    <div className="detail-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Shipment overview</h2><p>Information used to organize the document check.</p></div><ShieldCheck size={20} /></div><dl className="detail-list"><div><dt>Order reference</dt><dd>{item.external_reference || "Not provided"}</dd></div><div><dt>Transport</dt><dd>{item.transport_mode}</dd></div><div><dt>Risk level</dt><dd>{item.risk_level}</dd></div><div><dt>Assigned reviewer</dt><dd>{item.assigned_display_name || "Unassigned"}</dd></div><div><dt>Created</dt><dd>{new Date(item.created_at).toLocaleString("en-GB")}</dd></div><div><dt>Open checks</dt><dd>{item.open_tasks}</dd></div></dl></section><section className="data-panel"><div className="data-panel__header"><div><h2>Trusted reference</h2><p>Expected values recorded when this case was created.</p></div><CheckCircle size={20} /></div>{item.trusted_reference ? <dl className="detail-list"><div><dt>Expected recipient</dt><dd>{item.trusted_reference.expected_recipient || "Not provided"}</dd></div><div><dt>Expected destination</dt><dd>{item.trusted_reference.expected_destination || item.destination}</dd></div><div><dt>Expected total</dt><dd>{item.trusted_reference.expected_total ? `${item.trusted_reference.expected_currency || ""} ${item.trusted_reference.expected_total.toLocaleString("en-US")}` : "Not provided"}</dd></div><div><dt>Source</dt><dd>{item.trusted_reference.source_system}</dd></div></dl> : <p className="empty-copy">No trusted reference has been recorded.</p>}</section></div>
    <section className="data-panel data-panel--wide release-panel"><div className="data-panel__header"><div><h2>Release decision</h2><p>Authorize release only after every open check is resolved.</p></div><FileText size={20} /></div>{item.open_tasks > 0 && <div className="notice notice--warning">{item.open_tasks} check{item.open_tasks === 1 ? "" : "s"} still need attention before this shipment can be released.</div>}<label className="release-reason">Decision note<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record why this decision is being made" minLength={5} /></label>{decision.isError && <p role="alert" className="form-error">{(decision.error as Error).message}</p>}<div className="form-panel__actions">{canDecide ? <><Button variant="secondary" disabled={decision.isPending || reason.trim().length < 5} onClick={() => decision.mutate("HOLD")}>Place on hold</Button><Button disabled={decision.isPending || reason.trim().length < 5 || item.open_tasks > 0} onClick={() => decision.mutate("AUTHORIZE")}>Authorize release</Button></> : <span className="muted-label">A reviewer or administrator can record the release decision.</span>}</div></section>
  </div>;
}
