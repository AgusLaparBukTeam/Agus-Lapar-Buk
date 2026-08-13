"use client";

import { Table } from "@cloudflare/kumo/components/table";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { fetchOperationsList } from "@/lib/api";

export default function RulePacksPage() {
  const result = useQuery({ queryKey: ["rule-packs"], queryFn: () => fetchOperationsList("/rule-packs") });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader title="Rule packs" description="Review the published checks that explain how shipment assurance is evaluated." /><section className="data-panel data-panel--wide"><div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Rule pack</Table.Head><Table.Head>Version</Table.Head><Table.Head>Scope</Table.Head><Table.Head>Status</Table.Head><Table.Head>Effective</Table.Head></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={String(item.id)}><Table.Cell><Link className="table-link" href={`/governance/rule-packs/${String(item.id)}`}><strong>{String(item.name)}</strong></Link></Table.Cell><Table.Cell>{String(item.version)}</Table.Cell><Table.Cell>{String(item.scope)}</Table.Cell><Table.Cell>{String(item.status)}</Table.Cell><Table.Cell>{item.effective_from ? new Date(String(item.effective_from)).toLocaleDateString("en-GB") : "Not set"}</Table.Cell></Table.Row>)}</Table.Body></Table></div>{!items.length && <div className="empty-state"><strong>No rule packs published</strong><span>Publish a rule pack when the workspace has a review policy to use.</span></div>}</section></div>;
}
