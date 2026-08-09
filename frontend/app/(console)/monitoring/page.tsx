"use client";

import { Database, FileText, Pulse, ShieldCheck } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchMonitoring } from "@/lib/api";

function State({ value }: { value: string }) { const good = value === "healthy"; return <span className={`status-text ${good ? "status-text--good" : "status-text--bad"}`}><span className="status-dot" />{good ? "Available" : "Unavailable"}</span>; }

export default function MonitoringPage() {
  const { data, isPending, isError } = useQuery({ queryKey: ["monitoring"], queryFn: fetchMonitoring, refetchInterval: 30_000 });
  if (isPending) return <div className="page-loading">Checking service status…</div>;
  if (isError || !data) return <div role="alert" className="notice notice--danger">Service status is not available right now.</div>;
  return <div>
    <PageHeader icon={Pulse} title="Service status" description="Check that the tools your team relies on are ready for today's work." actions={<ActionLink href="/dashboard" variant="secondary">Back to overview</ActionLink>} />
    <section className="status-grid"><div className="status-panel"><Database size={19} /><div><span>Workspace data</span><State value={data.database} /></div></div><div className="status-panel"><ShieldCheck size={19} /><div><span>GateGuard application</span><State value={data.application} /></div></div><div className="status-panel"><FileText size={19} /><div><span>Document reading</span><strong>{data.provider_configured ? "Ready" : "Manual review only"}</strong></div></div><div className="status-panel"><Pulse size={19} /><div><span>Current release</span><strong>{data.version}</strong></div></div></section>
    <section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Recent activity volume</h2><p>Saved document checks from the last 24 hours.</p></div><span className="muted-label">Updates automatically</span></div><div className="metric-grid metric-grid--three"><div className="metric-cell"><span>Checks completed</span><strong>{String(data.volume.reconciliations_today ?? 0)}</strong></div><div className="metric-cell"><span>Average processing</span><strong>{Math.round(Number(data.volume.average_processing_ms ?? 0))}<small>ms</small></strong></div><div className="metric-cell"><span>On hold</span><strong>{String(data.volume.hold_today ?? 0)}</strong></div></div></section>
  </div>;
}
