"use client";

import { ClockCounterClockwiseIcon as ClockCounterClockwise } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { fetchRecents } from "@/lib/api";

export default function RecentsPage() {
  const result = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader icon={ClockCounterClockwise} title="Recents" description="Return to the shipment work, evidence, and decisions you opened most recently." /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Recently opened</h2><p>Only safe route metadata is retained here; document contents are never stored in the browser.</p></div></div>{items.length ? <div className="activity-list">{items.map((item) => <Link className="activity-row" href={String(item.href)} key={String(item.id)}><div><strong>{String(item.label)}</strong><small>{String(item.object_type)} · {new Date(String(item.viewed_at)).toLocaleString("en-GB")}</small></div><span aria-hidden="true">›</span></Link>)}</div> : <div className="empty-state"><strong>No recent items</strong><span>Open a shipment, document, exception, or release decision to see it here.</span></div>}</section></div>;
}
