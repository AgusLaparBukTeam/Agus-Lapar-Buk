"use client";

import { ChartLineIcon as ChartLine, ClockIcon as Clock } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AssuranceTimeseries } from "@/components/analytics/timeseries-chart";
import { ActionLink, Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchAnalyticsSummary, fetchAnalyticsTimeseries } from "@/lib/api";

const ranges = [[1, "24 hours"], [7, "7 days"], [30, "30 days"]] as const;

export default function AnalyticsPage() {
  const [days, setDays] = useState(7);
  const summary = useQuery({ queryKey: ["analytics-summary", days], queryFn: () => fetchAnalyticsSummary(days) });
  const series = useQuery({ queryKey: ["analytics-series", days], queryFn: () => fetchAnalyticsTimeseries(days) });
  const value = summary.data || {};
  const chartSeries = (series.data?.series || []) as Array<{ name: string; color: string; data: [number, number][] }>;
  return <div className="operations-page"><PageHeader icon={ChartLine} title="Analytics" description="Measure assurance decisions, exceptions, and processing with data from this workspace." actions={<ActionLink href="/audit" variant="secondary" icon={Clock}>Open activity log</ActionLink>} /><div className="segmented-control" aria-label="Time range">{ranges.map(([value, label]) => <Button key={value} size="sm" variant={days === value ? "primary" : "secondary"} onClick={() => setDays(value)}>{label}</Button>)}</div><section className="metric-grid metric-grid--four"><div className="metric-cell"><span>Active shipments</span><strong>{String(value.active_shipments || 0)}</strong><small>Cases not closed or dispatched</small></div><div className="metric-cell"><span>Assessments</span><strong>{String(value.assessments || 0)}</strong><small>Cases created in range</small></div><div className="metric-cell"><span>Open exceptions</span><strong>{String(value.open_exceptions || 0)}</strong><small>Unresolved across the workspace</small></div><div className="metric-cell"><span>Overdue work</span><strong>{String(value.overdue_work || 0)}</strong><small>Past the configured due date</small></div></section><section className="data-panel data-panel--wide chart-panel"><div className="data-panel__header"><div><h2>Assurance activity</h2><p>Only persisted shipment events are charted.</p></div></div><AssuranceTimeseries data={chartSeries} label="Assurance activity" /></section><div className="dashboard-grid"><section className="data-panel"><h2>Decisions</h2><p className="muted-copy">Release authorized: <strong>{String(value.release_authorized || 0)}</strong></p><p className="muted-copy">No data is inferred when the workspace has no completed assessments.</p></section><section className="data-panel"><h2>Exceptions</h2><p className="muted-copy">Open exceptions: <strong>{String(value.open_exceptions || 0)}</strong></p><p className="muted-copy">Overdue work: <strong>{String(value.overdue_work || 0)}</strong></p></section></div></div>;
}
