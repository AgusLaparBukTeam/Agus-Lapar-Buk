"use client";

import { ListChecksIcon as ListChecks, MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkQueue, updateWorkQueue } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function WorkQueuePage() {
  const [status, setStatus] = useState("OPEN");
  const [priority, setPriority] = useState("");
  const client = useQueryClient();
  const params = new URLSearchParams({ page: "1", page_size: "50", status });
  if (priority) params.set("priority", priority);
  const result = useQuery({ queryKey: ["work-queue", status, priority], queryFn: () => fetchWorkQueue(params) });
  const update = useMutation({ mutationFn: (value: { id: string; status: "IN_PROGRESS" | "RESOLVED" }) => updateWorkQueue(value.id, value.status), onSuccess: () => client.invalidateQueries({ queryKey: ["work-queue"] }) });
  return <div><PageHeader icon={ListChecks} title="Work queue" description="Review the shipment checks that need a person’s attention before release." actions={<ActionLink href="/shipments" variant="secondary" icon={MagnifyingGlass}>Browse shipments</ActionLink>} /><section className="filter-bar"><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter queue by status"><option value="OPEN">Open checks</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option><option value="">All checks</option></select><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter queue by priority"><option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></section>{result.isPending ? <div className="page-loading">Loading work queue…</div> : result.isError ? <div role="alert" className="notice notice--danger">The work queue is not available right now.</div> : <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Open work</h2><p>{result.data.total} checks match the current filters.</p></div></div>{result.data.items.length === 0 ? <div className="empty-state"><ListChecks size={22} /><strong>Queue is clear</strong><span>There are no checks waiting for this view.</span></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Shipment</th><th>Check</th><th>Stage</th><th>Priority</th><th>Assignee</th><th>Updated</th><th /></tr></thead><tbody>{result.data.items.map((task) => <tr key={task.id}><td><Link className="table-link" href={`/shipments/${task.shipment_id}`}>{task.shipment_reference}</Link></td><td>{task.issue}</td><td>{task.stage}</td><td><span className={`shipment-state shipment-state--${task.priority.toLowerCase()}`}>{task.priority}</span></td><td>{task.assignee || "Unassigned"}</td><td>{new Date(task.updated_at).toLocaleString("en-GB")}</td><td><Button variant="secondary" size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: task.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED" })}>{task.status === "OPEN" ? "Take check" : "Resolve"}</Button></td></tr>)}</tbody></table></div>}</section>}</div>;
}
