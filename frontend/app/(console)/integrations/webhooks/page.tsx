"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { createWebhook, fetchWebhooks } from "@/lib/api";

export default function WebhooksPage() {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["webhooks"], queryFn: fetchWebhooks });
  const [form, setForm] = useState({ name: "", endpoint: "", events: "shipment.created,release.decision.recorded" });
  const mutation = useMutation({ mutationFn: () => createWebhook({ ...form, events: form.events.split(",").map((item) => item.trim()).filter(Boolean) }), onSuccess: () => { setForm({ name: "", endpoint: "", events: "shipment.created,release.decision.recorded" }); client.invalidateQueries({ queryKey: ["webhooks"] }); } });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader title="Webhooks" description="Send shipment and decision updates to an approved destination." /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Add a destination</h2><p>Signing secrets are shown once when a subscription is created.</p></div></div><form className="form-panel" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-grid"><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Warehouse updates" /></label><label>Endpoint<input required type="url" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://example.com/gateguard" /></label><label>Events<input value={form.events} onChange={(event) => setForm({ ...form, events: event.target.value })} /></label></div>{mutation.data && <div className="notice notice--warning">Copy this signing secret now: <strong>{String(mutation.data.secret)}</strong></div>}{mutation.isError && <p className="form-error">{(mutation.error as Error).message}</p>}<div className="form-panel__actions"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Create webhook"}</Button></div></form></section><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Subscriptions</h2><p>{items.length} configured destination{items.length === 1 ? "" : "s"}.</p></div></div>{items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Endpoint</th><th>Events</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td><strong>{String(item.name)}</strong></td><td>{String(item.endpoint)}</td><td>{String((item.events as string[] | undefined)?.join(", ") || "All events")}</td><td>{item.enabled ? "Enabled" : "Disabled"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No webhook subscriptions</strong><span>Configured destinations will appear here.</span></div>}</section></div>;
}
