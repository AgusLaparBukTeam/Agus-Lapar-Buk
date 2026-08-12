"use client";

import { MagnifyingGlassIcon as MagnifyingGlass, PackageIcon as Package, PlusIcon as Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { ActionLink, Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchShipments } from "@/lib/api";
import type { ShipmentStatus } from "@/lib/types";

const statusLabels: Record<ShipmentStatus, string> = { DRAFT: "Draft", DOCUMENTS_REQUIRED: "Documents needed", REVIEW_REQUIRED: "Needs review", HOLD: "On hold", RELEASE_AUTHORIZED: "Release authorized", RELEASE_INVALIDATED: "Release needs review", DISPATCHED: "Dispatched", CLOSED: "Closed" };

function ShipmentState({ status }: { status: ShipmentStatus }) { return <span className={`shipment-state shipment-state--${status.toLowerCase()}`}>{statusLabels[status]}</span>; }

export default function ShipmentsPage() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const deferredQuery = useDeferredValue(query);
  const params = useMemo(() => {
    const value = new URLSearchParams({ page: String(page), page_size: "50" });
    if (deferredQuery) value.set("query", deferredQuery);
    if (status) value.set("status", status);
    return value;
  }, [deferredQuery, page, status]);
  const result = useQuery({ queryKey: ["shipments", params.toString()], queryFn: () => fetchShipments(params) });

  return <div>
    <PageHeader icon={Package} title="Shipments" description="Create a shipment case, compare its documents, and keep the release decision in one place." actions={<ActionLink href="/shipments/new" icon={Plus}>Create shipment</ActionLink>} />
    <section className="filter-bar" aria-label="Shipment filters"><label className="filter-search"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => { setPage(1); setQuery(event.target.value); }} placeholder="Search by shipment reference or destination" aria-label="Search shipments" /></label><select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} aria-label="Filter shipments by status"><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></section>
    {result.isPending ? <div className="page-loading">Loading shipments…</div> : result.isError ? <div role="alert" className="notice notice--danger">Shipments are not available right now.</div> : <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Shipment register</h2><p>{result.data.total} shipment cases in this workspace.</p></div></div>{result.data.items.length === 0 ? <div className="empty-state"><Package size={22} /><strong>No shipments yet</strong><span>Create the first shipment case to begin a document check.</span><ActionLink href="/shipments/new">Create shipment</ActionLink></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Reference</th><th>Route</th><th>Mode</th><th>Assurance</th><th>Open checks</th><th>Updated</th></tr></thead><tbody>{result.data.items.map((shipment) => <tr key={shipment.id}><td><Link className="table-link" href={`/shipments/${shipment.id}`}>{shipment.internal_reference}</Link><small>{shipment.external_reference || "No external reference"}</small></td><td>{shipment.origin} <span aria-hidden="true">→</span> {shipment.destination}</td><td>{shipment.transport_mode}</td><td><ShipmentState status={shipment.status} /><small>{shipment.risk_level.toLowerCase()} risk</small></td><td>{shipment.open_tasks}</td><td>{new Date(shipment.updated_at).toLocaleString("en-GB")}</td></tr>)}</tbody></table></div>}</section>}{result.data && <div className="pagination-row"><span className="muted-label">{result.data.total} hasil</span><div className="pagination-actions"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Sebelumnya</Button><Button variant="secondary" size="sm" disabled={page * result.data.page_size >= result.data.total} onClick={() => setPage((value) => value + 1)}>Berikutnya</Button></div></div>}
  </div>;
}
