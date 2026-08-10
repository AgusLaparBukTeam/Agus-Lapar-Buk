"use client";

import { ChartLine, ClipboardText, House, ListChecks, Package } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { fetchDashboard } from "@/lib/api";

const metrics = [["reconciliations_today", "Checks today", "Documents checked today"], ["clear_today", "Ready to release", "No material differences found"], ["review_today", "Needs review", "A person should confirm this"], ["hold_today", "On hold", "Do not release yet"], ["awaiting_review", "Waiting for review", "Open decisions"], ["overridden", "Decisions updated", "Supervisor changes recorded"]] as const;

export default function DashboardPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard, refetchInterval: 30_000 });
  if (isPending) return <div className="page-loading">Loading your workspace…</div>;
  if (isError || !data) return <div role="alert" className="notice notice--danger">The workspace summary is not available right now.</div>;
  return <div><PageHeader icon={House} title="Overview" description="A clear view of shipments, checks, and decisions that need attention." actions={<ActionLink href="/shipments/new" icon={Package}>Create shipment</ActionLink>} /><section className="metric-grid" aria-label="Operational summary">{metrics.map(([key, label, description]) => <div className="metric-cell" key={key}><span>{label}</span><strong>{data[key]}</strong><small>{description}</small></div>)}</section><div className="dashboard-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Recent checks</h2><p>The latest document checks stored in GateGuard.</p></div><ActionLink href="/history" variant="ghost">View all</ActionLink></div>{data.recent.length === 0 ? <div className="empty-state"><ClipboardText size={22} /><strong>No checks yet</strong><span>Start with a shipment and upload its documents.</span><ActionLink href="/shipments/new">Create shipment</ActionLink></div> : <div className="activity-list">{data.recent.map((item) => <a key={item.session_id} href={`/history/${item.session_id}`} className="activity-row"><div><strong>{String(item.documents.delivery_order?.shipment_id.value || item.session_id.slice(0, 8))}</strong><small>{new Date(item.created_at).toLocaleString("en-GB")} · {item.mismatches.length} findings</small></div><StatusBadge status={item.effective_status} /></a>)}</div>}</section><section className="data-panel"><div className="data-panel__header"><div><h2>Review coverage</h2><p>Decisions that still need a person today.</p></div><ChartLine size={20} /></div><div className="quality-value"><strong>{data.awaiting_review}</strong><span>open decisions</span></div><dl className="definition-list"><div><dt>Ready to release</dt><dd>{data.clear_today}</dd></div><div><dt>Needs review</dt><dd>{data.review_today}</dd></div><div><dt>On hold</dt><dd>{data.hold_today}</dd></div></dl><ActionLink href="/work-queue" variant="ghost" icon={ListChecks}>Open work queue</ActionLink></section></div></div>;
}
