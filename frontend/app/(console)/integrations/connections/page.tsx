"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { createConnection, createServiceAccount, fetchOperationsList } from "@/lib/api";

export default function ConnectionsPage() {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["connections"], queryFn: () => fetchOperationsList("/integrations/connections") });
  const [form, setForm] = useState({ name: "", type: "ERP", configuration: "{}" });
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const connection = useMutation({ mutationFn: () => createConnection({ name: form.name, type: form.type, configuration: JSON.parse(form.configuration) }), onSuccess: () => { setForm({ name: "", type: "ERP", configuration: "{}" }); client.invalidateQueries({ queryKey: ["connections"] }); } });
  const serviceAccount = useMutation({ mutationFn: () => createServiceAccount({ name: accountName, scopes: ["shipment.read", "shipment.write"] }), onSuccess: (data) => { setAccountName(""); setToken(String(data.token)); } });
  const items = result.data?.items || [];
  async function copyToken() { await navigator.clipboard.writeText(token); setTokenCopied(true); }
  return <div className="operations-page"><PageHeader title="Connections" description="Connect the workspace to approved business systems and partner services." /><div className="detail-grid"><form className="form-panel" onSubmit={(event) => { event.preventDefault(); connection.mutate(); }}><div className="form-panel__heading"><h2>Business connection</h2><p>Credentials are never stored in this form.</p></div><div className="form-grid"><Input label="Name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Warehouse system" /><label>Type<AppSelect ariaLabel="Connection type" value={form.type} onValueChange={(type) => setForm({ ...form, type })} options={[{ value: "ERP", label: "ERP" }, { value: "WMS", label: "WMS" }, { value: "Carrier", label: "Carrier" }, { value: "Screening provider", label: "Screening provider" }]} /></label></div>{connection.isError && <p className="form-error">{(connection.error as Error).message}</p>}<div className="form-panel__actions"><Button type="submit" variant="primary">Add connection</Button></div></form><form className="form-panel" onSubmit={(event) => { event.preventDefault(); serviceAccount.mutate(); }}><div className="form-panel__heading"><h2>Partner API access</h2><p>Create a token once, then store it in the partner system.</p></div><Input label="Service account" required value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Inbound partner" />{token && <div className="notice notice--warning"><strong>Copy this token now.</strong><p>It is shown once and will not be recoverable after you leave this page.</p><div className="token-reveal"><Input label="One-time service token" value={token} readOnly /><Button type="button" variant="secondary" onClick={copyToken}>{tokenCopied ? "Copied" : "Copy token"}</Button></div></div>}<div className="form-panel__actions"><Button type="submit" variant="primary">Create token</Button></div></form></div><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Configured systems</h2><p>{items.length} connection{items.length === 1 ? "" : "s"} in this workspace.</p></div></div>{items.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Name</Table.Head><Table.Head>Type</Table.Head><Table.Head>Status</Table.Head><Table.Head>Last success</Table.Head></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={String(item.id)}><Table.Cell><strong>{String(item.name)}</strong></Table.Cell><Table.Cell>{String(item.type)}</Table.Cell><Table.Cell>{String(item.status)}</Table.Cell><Table.Cell>{item.last_success_at ? new Date(String(item.last_success_at)).toLocaleString("en-GB") : "Not connected"}</Table.Cell></Table.Row>)}</Table.Body></Table></div> : <div className="empty-state"><strong>No connections yet</strong><span>Approved systems will appear here.</span></div>}</section></div>;
}
