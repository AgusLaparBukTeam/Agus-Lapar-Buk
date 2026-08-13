"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { MagnifyingGlassIcon as MagnifyingGlass, PlusIcon as Plus, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchOperationsList } from "@/lib/api";

type Column = { label: string; value: (row: Record<string, unknown>) => React.ReactNode };

const configs: Record<string, { title: string; description: string; path: string; columns: Column[]; action?: { href: string; label: string } }> = {
  documents: { title: "Documents", description: "Keep shipment evidence versioned, reviewable, and connected to its case.", path: "/documents", columns: [
    { label: "Document", value: (row) => <strong>{String(row.document_type)}</strong> },
    { label: "Shipment", value: (row) => String(row.shipment_reference) },
    { label: "Version", value: (row) => row.version ? `v${String((row.version as Record<string, unknown>).version)}` : "—" },
    { label: "Extraction", value: (row) => row.version ? String((row.version as Record<string, unknown>).extraction_status) : "Pending" },
    { label: "Status", value: (row) => <span className="table-status">{String(row.status)}</span> },
  ] },
  parties: { title: "Parties", description: "Maintain the trading parties involved in shipment cases.", path: "/parties", columns: [
    { label: "Party", value: (row) => <strong>{String(row.legal_name)}</strong> },
    { label: "Country", value: (row) => String(row.country_code || "—") },
    { label: "Identifier", value: (row) => String(row.external_identifier || row.tax_identifier || "—") },
    { label: "Screening", value: (row) => String(row.screening) },
    { label: "Shipments", value: (row) => String(row.shipment_count) },
  ] },
  products: { title: "Products & commodities", description: "See the items moving through your shipment cases and the evidence attached to them.", path: "/products", columns: [
    { label: "SKU", value: (row) => <strong>{String(row.sku || "Unassigned")}</strong> },
    { label: "Description", value: (row) => String(row.description) },
    { label: "Shipment", value: (row) => String(row.shipment_reference) },
    { label: "Quantity", value: (row) => `${String(row.quantity)} ${String(row.unit_of_measure)}` },
    { label: "Dangerous goods", value: (row) => row.dangerous_goods ? "Review required" : "No" },
  ] },
  transport: { title: "Transport", description: "Record planned movement, carriers, and equipment without pretending to provide live tracking.", path: "/transport", columns: [
    { label: "Mode", value: (row) => <strong>{String(row.mode)}</strong> },
    { label: "Carrier", value: (row) => String(row.carrier || "—") },
    { label: "Origin", value: (row) => String(row.origin || "—") },
    { label: "Destination", value: (row) => String(row.destination || "—") },
    { label: "Planned arrival", value: (row) => row.planned_arrival ? new Date(String(row.planned_arrival)).toLocaleString("en-GB") : "—" },
  ] },
  requirements: { title: "Requirements", description: "Understand which evidence is expected for each shipment and why.", path: "/requirements", columns: [
    { label: "Requirement", value: (row) => <strong>{String((row.requirement as Record<string, unknown>).name)}</strong> },
    { label: "Shipment", value: (row) => String(row.shipment_reference) },
    { label: "Document type", value: (row) => String((row.requirement as Record<string, unknown>).document_type) },
    { label: "Result", value: (row) => <span className="table-status">{String((row.evaluation as Record<string, unknown>).result)}</span> },
    { label: "Reason", value: (row) => String((row.evaluation as Record<string, unknown>).reason) },
  ] },
  assurance: { title: "Assurance checks", description: "Review checks across shipment cases, with evidence and the rule version that produced them.", path: "/assurance", columns: [
    { label: "Shipment", value: (row) => <strong>{String(row.shipment_reference)}</strong> },
    { label: "Check", value: (row) => String(row.check_type) },
    { label: "Status", value: (row) => <span className="table-status">{String(row.status)}</span> },
    { label: "Severity", value: (row) => String(row.severity) },
    { label: "Source", value: (row) => String(row.source) },
    { label: "Completed", value: (row) => row.completed_at ? new Date(String(row.completed_at)).toLocaleString("en-GB") : "—" },
  ] },
  exceptions: { title: "Exceptions", description: "Resolve the issues that keep a shipment from moving forward.", path: "/exceptions", columns: [
    { label: "Severity", value: (row) => <span className="table-status">{String(row.severity)}</span> },
    { label: "Shipment", value: (row) => <strong>{String(row.shipment_reference)}</strong> },
    { label: "Exception", value: (row) => String(row.summary) },
    { label: "Assignee", value: (row) => String(row.assigned_to || "Unassigned") },
    { label: "Due", value: (row) => row.due_at ? new Date(String(row.due_at)).toLocaleString("en-GB") : "—" },
    { label: "Status", value: (row) => String(row.status) },
  ] },
  releases: { title: "Release decisions", description: "Review the immutable decisions that authorize, hold, or invalidate dispatch.", path: "/releases", columns: [
    { label: "Shipment", value: (row) => <strong>{String(row.shipment_reference)}</strong> },
    { label: "Decision", value: (row) => String(row.decision) },
    { label: "Issued by", value: (row) => String(row.issued_by_name) },
    { label: "Issued", value: (row) => new Date(String(row.created_at)).toLocaleString("en-GB") },
    { label: "Reason", value: (row) => String(row.reason) },
  ] },
  screening: { title: "Party screening", description: "Keep screening honest: configured providers report results; unconfigured providers do not claim coverage.", path: "/screening", columns: [
    { label: "Party", value: (row) => <strong>{String(row.party)}</strong> },
    { label: "Shipment", value: (row) => String(row.shipment_reference) },
    { label: "Provider", value: (row) => String((row.run as Record<string, unknown>).provider) },
    { label: "Result", value: (row) => String((row.run as Record<string, unknown>).result) },
    { label: "Score", value: (row) => String((row.run as Record<string, unknown>).score ?? "—") },
  ] },
  "dangerous-goods": { title: "Dangerous goods", description: "Review items that need complete dangerous-goods information before release.", path: "/dangerous-goods", columns: [
    { label: "Shipment", value: (row) => <strong>{String(row.shipment_reference)}</strong> },
    { label: "Item", value: (row) => String((row.item as Record<string, unknown>).description) },
    { label: "UN number", value: (row) => String((row.item as Record<string, unknown>).un_number || "Missing") },
    { label: "Hazard class", value: (row) => String((row.item as Record<string, unknown>).hazard_class || "Missing") },
    { label: "Assurance", value: (row) => String(row.assurance) },
  ] },
  connections: { title: "Connections", description: "See the systems configured to exchange shipment information with this workspace.", path: "/integrations/connections", columns: [
    { label: "Name", value: (row) => <strong>{String(row.name)}</strong> },
    { label: "Type", value: (row) => String(row.type) },
    { label: "Status", value: (row) => String(row.status) },
    { label: "Last success", value: (row) => row.last_success_at ? new Date(String(row.last_success_at)).toLocaleString("en-GB") : "—" },
    { label: "Last error", value: (row) => row.last_error_at ? new Date(String(row.last_error_at)).toLocaleString("en-GB") : "—" },
  ] },
  jobs: { title: "Processing jobs", description: "Track bounded extraction, assessment, and delivery work without hiding failures.", path: "/integrations/jobs", columns: [
    { label: "Job", value: (row) => <strong>{String(row.job_type)}</strong> },
    { label: "Status", value: (row) => String(row.status) },
    { label: "Attempts", value: (row) => String(row.attempts) },
    { label: "Queued", value: (row) => new Date(String(row.queued_at)).toLocaleString("en-GB") },
    { label: "Error", value: (row) => String(row.safe_error || "—") },
  ] },
};

export function OperationRegister({ kind, includeHeader = true }: { kind: keyof typeof configs; includeHeader?: boolean }) {
  const config = configs[kind];
  const [query, setQuery] = useState("");
  const result = useQuery({ queryKey: ["operations", kind, query], queryFn: () => fetchOperationsList(config.path, query ? { q: query } : undefined) });
  const rows = useMemo(() => result.data?.items || [], [result.data]);
  return <div className="operations-page">
    {includeHeader && <PageHeader title={config.title} description={config.description} actions={config.action ? <ActionLink href={config.action.href} icon={Plus}>{config.action.label}</ActionLink> : undefined} />}
    <div className="operations-toolbar"><div className="operations-search"><MagnifyingGlass size={16} aria-hidden="true" /><Input className="operations-search__input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}...`} aria-label={`Search ${config.title}`} /><span className="muted-label">{rows.length} records</span></div></div>
    {result.isError ? <div className="notice notice--danger"><WarningCircle size={18} /> This register is not available right now.</div> : <section className="data-panel data-panel--wide"><div className="table-scroll"><Table><Table.Header sticky><Table.Row>{config.columns.map((column) => <Table.Head key={column.label}>{column.label}</Table.Head>)}</Table.Row></Table.Header><Table.Body>{rows.map((row) => <Table.Row key={String(row.id)}>{config.columns.map((column) => <Table.Cell key={column.label}>{column.value(row)}</Table.Cell>)}</Table.Row>)}</Table.Body></Table></div>{!result.isPending && rows.length === 0 && <div className="empty-state"><strong>No {config.title.toLowerCase()} yet</strong><span>Records appear here when your team creates them in this workspace.</span></div>}</section>}
  </div>;
}
