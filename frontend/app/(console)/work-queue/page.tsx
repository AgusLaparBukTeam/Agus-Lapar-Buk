"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ListChecksIcon as ListChecks, MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
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
  return <div><PageHeader icon={ListChecks} title="Work queue" description="Review the shipment checks that need a person’s attention before release." actions={<ActionLink href="/shipments" variant="secondary" icon={MagnifyingGlass}>Browse shipments</ActionLink>} /><section className="filter-bar"><AppSelect ariaLabel="Filter queue by status" value={status} onValueChange={setStatus} options={[{ value: "OPEN", label: "Open checks" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "RESOLVED", label: "Resolved" }, { value: "", label: "All checks" }]} /><AppSelect ariaLabel="Filter queue by priority" value={priority} onValueChange={setPriority} options={[{ value: "", label: "All priorities" }, { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} /></section>{result.isPending ? <div className="page-loading">Loading work queue…</div> : result.isError ? <div role="alert" className="notice notice--danger">The work queue is not available right now.</div> : <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Open work</h2><p>{result.data.total} checks match the current filters.</p></div></div>{result.data.items.length === 0 ? <div className="empty-state"><ListChecks size={22} /><strong>Queue is clear</strong><span>There are no checks waiting for this view.</span></div> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Shipment</Table.Head><Table.Head>Check</Table.Head><Table.Head>Stage</Table.Head><Table.Head>Priority</Table.Head><Table.Head>Assignee</Table.Head><Table.Head>Updated</Table.Head><Table.Head><span className="sr-only">Action</span></Table.Head></Table.Row></Table.Header><Table.Body>{result.data.items.map((task) => <Table.Row key={task.id}><Table.Cell><Link className="table-link" href={`/shipments/${task.shipment_id}`}>{task.shipment_reference}</Link></Table.Cell><Table.Cell>{task.issue}</Table.Cell><Table.Cell>{task.stage}</Table.Cell><Table.Cell><span className={`shipment-state shipment-state--${task.priority.toLowerCase()}`}>{task.priority}</span></Table.Cell><Table.Cell>{task.assignee || "Unassigned"}</Table.Cell><Table.Cell>{new Date(task.updated_at).toLocaleString("en-GB")}</Table.Cell><Table.Cell><Button variant="secondary" size="sm" disabled={update.isPending} onClick={() => update.mutate({ id: task.id, status: task.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED" })}>{task.status === "OPEN" ? "Take check" : "Resolve"}</Button></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</section>}</div>;
}
