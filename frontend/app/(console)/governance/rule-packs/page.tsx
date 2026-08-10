"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useQuery } from "@tanstack/react-query";
import { fetchOperationsList } from "@/lib/api";

export default function RulePacksPage() {
  const result = useQuery({ queryKey: ["rule-packs"], queryFn: () => fetchOperationsList("/rule-packs") });
  return <div className="operations-page"><PageHeader title="Rule packs" description="Review the published checks that explain how shipment assurance is evaluated." /><section className="data-panel data-panel--wide"><div className="table-scroll"><table className="data-table"><thead><tr><th>Rule pack</th><th>Version</th><th>Scope</th><th>Status</th><th>Effective</th></tr></thead><tbody>{(result.data?.items || []).map((item) => <tr key={String(item.id)}><td><strong>{String(item.name)}</strong></td><td>{String(item.version)}</td><td>{String(item.scope)}</td><td>{String(item.status)}</td><td>{item.effective_from ? new Date(String(item.effective_from)).toLocaleDateString("en-GB") : "—"}</td></tr>)}</tbody></table></div>{!result.data?.items?.length && <div className="empty-state"><strong>No rule packs published</strong><span>Publish a rule pack when the workspace has a review policy to use.</span></div>}</section></div>;
}
