"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { fetchOperationsList } from "@/lib/api";

export default function RulePacksPage() {
  const result = useQuery({ queryKey: ["rule-packs"], queryFn: () => fetchOperationsList("/rule-packs") });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader title="Rule packs" description="Review the published checks that explain how shipment assurance is evaluated." /><section className="data-panel data-panel--wide"><div className="table-scroll"><table className="data-table"><thead><tr><th>Rule pack</th><th>Version</th><th>Scope</th><th>Status</th><th>Effective</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td><Link className="table-link" href={`/governance/rule-packs/${String(item.id)}`}><strong>{String(item.name)}</strong></Link></td><td>{String(item.version)}</td><td>{String(item.scope)}</td><td>{String(item.status)}</td><td>{item.effective_from ? new Date(String(item.effective_from)).toLocaleDateString("en-GB") : "Not set"}</td></tr>)}</tbody></table></div>{!items.length && <div className="empty-state"><strong>No rule packs published</strong><span>Publish a rule pack when the workspace has a review policy to use.</span></div>}</section></div>;
}
