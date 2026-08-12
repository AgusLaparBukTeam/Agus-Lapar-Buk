"use client";

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
  const connection = useMutation({ mutationFn: () => createConnection({ name: form.name, type: form.type, configuration: JSON.parse(form.configuration) }), onSuccess: () => { setForm({ name: "", type: "ERP", configuration: "{}" }); client.invalidateQueries({ queryKey: ["connections"] }); } });
  const serviceAccount = useMutation({ mutationFn: () => createServiceAccount({ name: accountName, scopes: ["shipment.read", "shipment.write"] }), onSuccess: (data) => { setAccountName(""); setToken(String(data.token)); } });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader title="Connections" description="Connect the workspace to approved business systems and partner services." /><div className="detail-grid"><form className="form-panel" onSubmit={(event) => { event.preventDefault(); connection.mutate(); }}><div className="form-panel__heading"><h2>Business connection</h2><p>Credentials are never stored in this form.</p></div><div className="form-grid"><label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Warehouse system" /></label><label>Type<AppSelect ariaLabel="Connection type" value={form.type} onValueChange={(type) => setForm({ ...form, type })} options={[{ value: "ERP", label: "ERP" }, { value: "WMS", label: "WMS" }, { value: "Carrier", label: "Carrier" }, { value: "Screening provider", label: "Screening provider" }]} /></label></div>{connection.isError && <p className="form-error">{(connection.error as Error).message}</p>}<div className="form-panel__actions"><Button type="submit" variant="primary">Add connection</Button></div></form><form className="form-panel" onSubmit={(event) => { event.preventDefault(); serviceAccount.mutate(); }}><div className="form-panel__heading"><h2>Partner API access</h2><p>Create a token once, then store it in the partner system.</p></div><label className="release-reason">Service account<input required value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Inbound partner" /></label>{token && <div className="notice notice--warning">Copy this token now: <strong>{token}</strong></div>}<div className="form-panel__actions"><Button type="submit" variant="primary">Create token</Button></div></form></div><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Configured systems</h2><p>{items.length} connection{items.length === 1 ? "" : "s"} in this workspace.</p></div></div>{items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Last success</th></tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td><strong>{String(item.name)}</strong></td><td>{String(item.type)}</td><td>{String(item.status)}</td><td>{item.last_success_at ? new Date(String(item.last_success_at)).toLocaleString("en-GB") : "Not connected"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No connections yet</strong><span>Approved systems will appear here.</span></div>}</section></div>;
}
