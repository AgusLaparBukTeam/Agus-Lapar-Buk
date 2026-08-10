"use client";

import { ActivityIcon as Activity, ChartLineIcon as ChartLine } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { fetchObservability } from "@/lib/api";

export default function ObservabilityPage() {
  const result = useQuery({ queryKey: ["observability"], queryFn: fetchObservability, refetchInterval: 30_000 });
  const data = result.data || {};
  const health = [["Application", data.application], ["Database", data.database], ["Worker", data.worker], ["Extraction", data.extraction], ["Webhooks", data.webhook]];
  return <div className="operations-page"><PageHeader icon={Activity} title="Observability" description="See whether the work needed to assess shipments is available and moving." /><section className="health-strip">{health.map(([label, state]) => <div className="health-cell" key={String(label)}><span>{String(label)}</span><strong className={state === "ready" || state === "available" ? "health-good" : "health-neutral"}>{String(state || "unknown")}</strong></div>)}</section><div className="dashboard-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Processing queue</h2><p>Jobs are persisted so failures can be retried or investigated.</p></div><ChartLine size={20} /></div><div className="quality-value"><strong>{String(data.queue_depth || 0)}</strong><span>queued or running jobs</span></div>{data.oldest_queued_job ? <p className="muted-copy">Oldest job: {String((data.oldest_queued_job as Record<string, unknown>).job_type)}</p> : <p className="empty-copy">No queued jobs.</p>}</section><section className="data-panel"><div className="data-panel__header"><div><h2>Operational notes</h2><p>States are read from the workspace, not assumed healthy.</p></div></div><div className="empty-state"><strong>No recent failures</strong><span>When a job or integration fails, the safe error appears in the corresponding register.</span></div></section></div></div>;
}
