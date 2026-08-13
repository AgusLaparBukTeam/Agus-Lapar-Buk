"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ArchiveIcon as Archive } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { fetchAudit } from "@/lib/api";

const eventLabels: Record<string, string> = { "auth.login.success": "Signed in", "auth.logout": "Signed out", "reconciliation.created": "Document check completed", "shipment.created": "Shipment created", "shipment.release_decision": "Release decision recorded", "user.created": "Person added", "user.updated": "Access updated" };

export default function AuditPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["audit"], queryFn: fetchAudit });
  if (isPending) return <div className="page-loading">Loading activity…</div>;
  if (isError || !data) return <div role="alert" className="notice notice--danger">Activity log is not available right now.</div>;
  return <div><PageHeader icon={Archive} title="Activity log" description="A shared record of important shipment checks, decisions, and access changes." /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Recent activity</h2><p>Events are recorded with the person and item involved.</p></div></div><div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>When</Table.Head><Table.Head>Activity</Table.Head><Table.Head>Person</Table.Head><Table.Head>Item</Table.Head><Table.Head>Details</Table.Head></Table.Row></Table.Header><Table.Body>{data.map((event) => <Table.Row key={event.id}><Table.Cell>{new Date(event.created_at).toLocaleString("en-GB")}</Table.Cell><Table.Cell><strong>{eventLabels[event.event_type] || event.event_type}</strong></Table.Cell><Table.Cell>{event.actor_display_name || "System"}</Table.Cell><Table.Cell>{event.entity_type}{event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : ""}</Table.Cell><Table.Cell>{event.metadata.reason ? String(event.metadata.reason) : event.metadata.decision ? `Decision: ${String(event.metadata.decision)}` : "Recorded"}</Table.Cell></Table.Row>)}</Table.Body></Table></div></section></div>;
}
