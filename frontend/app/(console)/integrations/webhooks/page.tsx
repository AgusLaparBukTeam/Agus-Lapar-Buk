"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
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
  const [secretCopied, setSecretCopied] = useState(false);
  async function copySecret() { await navigator.clipboard.writeText(String(mutation.data?.secret || "")); setSecretCopied(true); }
  return <div className="operations-page"><PageHeader title="Webhooks" description="Send shipment and decision updates to an approved destination." /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Add a destination</h2><p>Signing secrets are shown once when a subscription is created.</p></div></div><form className="form-panel" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-grid"><Input label="Name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Warehouse updates" /><Input label="Endpoint" required type="url" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://example.com/gateguard" /><Input label="Events" description="Separate event names with commas." value={form.events} onChange={(event) => setForm({ ...form, events: event.target.value })} /></div>{mutation.data && <div className="notice notice--warning"><strong>Copy this signing secret now.</strong><p>It is shown once and cannot be retrieved later.</p><div className="token-reveal"><Input label="One-time signing secret" value={String(mutation.data.secret)} readOnly /><Button type="button" variant="secondary" onClick={copySecret}>{secretCopied ? "Copied" : "Copy secret"}</Button></div></div>}{mutation.isError && <p className="form-error">{(mutation.error as Error).message}</p>}<div className="form-panel__actions"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Create webhook"}</Button></div></form></section><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Subscriptions</h2><p>{items.length} configured destination{items.length === 1 ? "" : "s"}.</p></div></div>{items.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Name</Table.Head><Table.Head>Endpoint</Table.Head><Table.Head>Events</Table.Head><Table.Head>Status</Table.Head></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={String(item.id)}><Table.Cell><strong>{String(item.name)}</strong></Table.Cell><Table.Cell>{String(item.endpoint)}</Table.Cell><Table.Cell>{String((item.events as string[] | undefined)?.join(", ") || "All events")}</Table.Cell><Table.Cell>{item.enabled ? "Enabled" : "Disabled"}</Table.Cell></Table.Row>)}</Table.Body></Table></div> : <div className="empty-state"><strong>No webhook subscriptions</strong><span>Configured destinations will appear here.</span></div>}</section></div>;
}
