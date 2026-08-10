"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { PlusIcon as Plus, ArchiveIcon as ReferenceIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { createReferenceData, fetchReferenceData } from "@/lib/api";

export default function ReferenceDataPage() {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["reference-data"], queryFn: () => fetchReferenceData() });
  const [form, setForm] = useState({ category: "COUNTRY", code: "", label: "", source: "Workspace maintained", version: "1" });
  const [open, setOpen] = useState(false);
  const mutation = useMutation({ mutationFn: () => createReferenceData(form), onSuccess: () => { setOpen(false); setForm({ category: "COUNTRY", code: "", label: "", source: "Workspace maintained", version: "1" }); client.invalidateQueries({ queryKey: ["reference-data"] }); } });
  const items = result.data?.items || [];
  return <div className="operations-page"><PageHeader icon={ReferenceIcon} title="Reference data" description="Maintain the shared codes your team uses to describe shipments consistently." actions={<Button icon={Plus} onClick={() => setOpen(true)}>Add entry</Button>} /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Workspace reference entries</h2><p>Values are workspace-owned unless a source and version say otherwise.</p></div><span className="muted-label">{items.length} entries</span></div><div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Category</Table.Head><Table.Head>Code</Table.Head><Table.Head>Label</Table.Head><Table.Head>Source</Table.Head><Table.Head>Version</Table.Head></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={String(item.id)}><Table.Cell><strong>{String(item.category)}</strong></Table.Cell><Table.Cell>{String(item.code)}</Table.Cell><Table.Cell>{String(item.label)}</Table.Cell><Table.Cell>{String(item.source)}</Table.Cell><Table.Cell>{String(item.version)}</Table.Cell></Table.Row>)}</Table.Body></Table></div>{!items.length && <div className="empty-state"><strong>No reference data yet</strong><span>Add the values your team needs for countries, currencies, units, or internal codes.</span></div>}</section>{open && <section className="form-panel reference-form"><div className="data-panel__header"><div><h2>Add reference entry</h2><p>Use a stable code and keep the source visible for reviewers.</p></div></div><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-grid"><label>Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value.toUpperCase() })} /></label><label>Code<input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></label><label>Label<input required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label><label>Source<input required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label><label>Version<input required value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></label></div>{mutation.isError && <p className="form-error" role="alert">{(mutation.error as Error).message}</p>}<div className="form-panel__actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Save entry</Button></div></form></section>}</div>;
}
