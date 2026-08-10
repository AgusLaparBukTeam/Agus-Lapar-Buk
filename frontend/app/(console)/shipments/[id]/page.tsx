"use client";

import { ArrowLeftIcon as ArrowLeft, PackageIcon as Package, ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { decideRelease, fetchMe, fetchWorkspaceShipment, transitionShipment } from "@/lib/api";

const labels: Record<string, string> = { DRAFT: "Draft", DOCUMENTS_REQUIRED: "Documents needed", REVIEW_REQUIRED: "Needs review", HOLD: "On hold", RELEASE_AUTHORIZED: "Release authorized", RELEASE_INVALIDATED: "Release needs review", DISPATCHED: "Dispatched", CLOSED: "Closed" };
const tabs = ["Overview", "Documents", "Items", "Parties", "Transport", "Assurance", "Exceptions", "Timeline"] as const;
type Tab = (typeof tabs)[number];
type Row = Record<string, any>;

function State({ status }: { status: string }) { return <span className={`shipment-state shipment-state--${status.toLowerCase()}`}>{labels[status] || status}</span>; }
function value(row: Row | undefined, key: string, fallback = "Not provided") { const result = row?.[key]; return result === null || result === undefined || result === "" ? fallback : String(result); }

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");
  const [reason, setReason] = useState("");
  const workspace = useQuery({ queryKey: ["shipment-workspace", id], queryFn: () => fetchWorkspaceShipment(id) });
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const decision = useMutation({ mutationFn: (decisionValue: "AUTHORIZE" | "HOLD") => decideRelease(id, { decision: decisionValue, reason }), onSuccess: () => { setReason(""); client.invalidateQueries({ queryKey: ["shipment-workspace", id] }); client.invalidateQueries({ queryKey: ["work-queue"] }); } });
  const move = useMutation({ mutationFn: (status: string) => transitionShipment(id, status), onSuccess: () => client.invalidateQueries({ queryKey: ["shipment-workspace", id] }) });
  if (workspace.isPending) return <div className="page-loading">Loading shipment...</div>;
  if (workspace.isError || !workspace.data) return <div role="alert" className="notice notice--danger">This shipment could not be loaded.</div>;
  const data = workspace.data as Row;
  const item = data.shipment as Row;
  const canDecide = me.data?.role === "admin" || me.data?.role === "supervisor";
  const list = (key: string) => Array.isArray(data[key]) ? data[key] as Row[] : [];
  const gate = list("release_gate");
  const renderTable = (rows: Row[], columns: Array<[string, string]>) => rows.length ? <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map(([key, heading]) => <th key={key}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id || index)}>{columns.map(([key]) => <td key={key}>{value(row, key)}</td>)}</tr>)}</tbody></table></div> : <div className="empty-state"><strong>No records yet</strong><span>Information will appear as this shipment is prepared.</span></div>;
  return <div className="operations-page"><Link className="back-link" href="/shipments"><ArrowLeft size={15} /> Back to shipments</Link><PageHeader icon={Package} title={value(item, "internal_reference")} description={`${value(item, "origin")} to ${value(item, "destination")}`} actions={<State status={value(item, "status")} />} /><nav className="detail-tabs" aria-label="Shipment sections">{tabs.map((itemTab) => <button className={tab === itemTab ? "is-active" : ""} key={itemTab} onClick={() => setTab(itemTab)}>{itemTab}</button>)}</nav>
    {tab === "Overview" && <div className="detail-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Shipment overview</h2><p>Key information used for the assurance record.</p></div><ShieldCheck size={20} /></div><dl className="detail-list"><div><dt>Order reference</dt><dd>{value(item, "external_reference")}</dd></div><div><dt>Transport</dt><dd>{value(item, "transport_mode")}</dd></div><div><dt>Priority</dt><dd>{value(item, "priority")}</dd></div><div><dt>Risk level</dt><dd>{value(item, "risk_level")}</dd></div><div><dt>Currency</dt><dd>{value(item, "currency")}</dd></div><div><dt>Last assessed</dt><dd>{item.last_assessed_at ? new Date(item.last_assessed_at).toLocaleString("en-GB") : "Not assessed"}</dd></div></dl></section><section className="data-panel"><div className="data-panel__header"><div><h2>Release gate</h2><p>Every item must be clear before dispatch.</p></div></div><div className="gate-list">{gate.map((entry) => <div key={String(entry.key)}><span>{String(entry.label)}</span><strong className={`gate-state gate-state--${String(entry.state).toLowerCase()}`}>{String(entry.state)}</strong></div>)}</div></section></div>}
    {tab === "Documents" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Document vault</h2><p>Versioned evidence attached to this shipment.</p></div></div>{renderTable(list("documents"), [["document_type", "Type"], ["status", "Status"], ["created_at", "Added"], ["updated_at", "Updated"]])}</section>}
    {tab === "Items" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Shipment items</h2><p>Commodity and dangerous-goods data captured for this movement.</p></div></div>{renderTable(list("items"), [["line_number", "Line"], ["sku", "SKU"], ["description", "Description"], ["quantity", "Quantity"], ["hs_code", "HS code"], ["dangerous_goods", "Dangerous goods"]])}</section>}
    {tab === "Parties" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Trade parties</h2><p>Organizations connected to this shipment.</p></div></div>{renderTable(list("parties").map((row) => ({ ...row, legal_name: row.party?.legal_name, country_code: row.party?.country_code })), [["role", "Role"], ["legal_name", "Party"], ["country_code", "Country"]])}</section>}
    {tab === "Transport" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Transport plan</h2><p>Planned legs and equipment for this shipment.</p></div></div>{renderTable(list("transport"), [["sequence", "Leg"], ["mode", "Mode"], ["carrier", "Carrier"], ["origin", "Origin"], ["destination", "Destination"], ["planned_arrival", "Planned arrival"]])}</section>}
    {tab === "Assurance" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Assurance checks</h2><p>Checks retain their source and rule version for review.</p></div></div>{renderTable(list("checks"), [["check_type", "Check"], ["status", "Status"], ["severity", "Severity"], ["source", "Source"], ["completed_at", "Completed"]])}</section>}
    {tab === "Exceptions" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Exceptions</h2><p>Issues that need a documented resolution.</p></div></div>{renderTable(list("exceptions"), [["severity", "Severity"], ["summary", "Exception"], ["status", "Status"], ["assigned_to", "Assignee"], ["due_at", "Due"]])}</section>}
    {tab === "Timeline" && <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Shipment timeline</h2><p>The record below is based on stored shipment timestamps.</p></div></div>{renderTable([item], [["created_at", "Created"], ["assessment_started_at", "Assessment started"], ["last_assessed_at", "Last assessed"], ["release_authorized_at", "Release authorized"], ["dispatched_at", "Dispatched"], ["closed_at", "Closed"]])}</section>}
    <section className="data-panel data-panel--wide release-panel"><div className="data-panel__header"><div><h2>Decision and movement</h2><p>Reviewer actions are recorded as immutable events.</p></div></div><label className="release-reason">Decision note<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record why this decision is being made" minLength={5} /></label>{decision.isError && <p role="alert" className="form-error">{(decision.error as Error).message}</p>}{move.isError && <p role="alert" className="form-error">{(move.error as Error).message}</p>}<div className="form-panel__actions">{canDecide && <><Button variant="secondary" disabled={decision.isPending || reason.trim().length < 5} onClick={() => decision.mutate("HOLD")}>Place on hold</Button><Button disabled={decision.isPending || reason.trim().length < 5 || Number(item.open_tasks || 0) > 0} onClick={() => decision.mutate("AUTHORIZE")}>Authorize release</Button></>}{item.status === "RELEASE_AUTHORIZED" && canDecide && <Button onClick={() => move.mutate("DISPATCHED")}>Mark dispatched</Button>}{item.status === "DISPATCHED" && canDecide && <Button onClick={() => move.mutate("CLOSED")}>Close shipment</Button>}{!canDecide && <span className="muted-label">A reviewer or administrator can record movement decisions.</span>}</div></section>
  </div>;
}
