"use client";

import { ChartLine, ListChecks, Package } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchDashboard } from "@/lib/api";

export default function DecisionInsightsPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["decision-insights"], queryFn: fetchDashboard });
  if (isPending) return <div className="page-loading">Loading decision insights…</div>;
  if (isError || !data) return <div role="alert" className="notice notice--danger">Decision insights are not available right now.</div>;
  return <div><PageHeader icon={ChartLine} title="Decision insights" description="See where shipment checks are clear, waiting, or holding up release." actions={<ActionLink href="/work-queue" icon={ListChecks}>Open work queue</ActionLink>} /><section className="metric-grid metric-grid--four"><div className="metric-cell"><span>Ready to release</span><strong>{data.clear_today}</strong><small>Checks with no material differences</small></div><div className="metric-cell"><span>Needs review</span><strong>{data.review_today}</strong><small>Checks waiting for confirmation</small></div><div className="metric-cell"><span>On hold</span><strong>{data.hold_today}</strong><small>Do not release yet</small></div><div className="metric-cell"><span>Decisions updated</span><strong>{data.overridden}</strong><small>Supervisor decisions recorded</small></div></section><div className="dashboard-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>What needs attention</h2><p>Use the work queue to move checks forward.</p></div><ListChecks size={20} /></div><dl className="definition-list definition-list--large"><div><dt>Open decisions</dt><dd>{data.awaiting_review}</dd></div><div><dt>Checks completed today</dt><dd>{data.reconciliations_today}</dd></div><div><dt>Checks with a clear result</dt><dd>{data.clear_today}</dd></div></dl><ActionLink href="/work-queue" variant="secondary" icon={ListChecks}>Review open checks</ActionLink></section><section className="data-panel"><div className="data-panel__header"><div><h2>Start with a shipment</h2><p>Keep the case, documents, findings, and release decision connected.</p></div><Package size={20} /></div><div className="empty-state"><strong>Create a shipment case</strong><span>Begin with a reference and route before documents arrive.</span><ActionLink href="/shipments/new">Create shipment</ActionLink></div></section></div></div>;
}
