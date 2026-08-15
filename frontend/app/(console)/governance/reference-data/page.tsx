"use client";

import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { PlusIcon as Plus, ArchiveIcon as ReferenceIcon, MagnifyingGlassIcon as Search } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { createReferenceData, fetchReferenceData } from "@/lib/api";

type ReferenceItem = { id: string; category: string; code: string; label: string; source: string; version: string; active: boolean };

export default function ReferenceDataPage() {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["reference-data"], queryFn: () => fetchReferenceData() });
  const [form, setForm] = useState({ category: "COUNTRY", code: "", label: "", source: "Workspace maintained", version: "1" });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const mutation = useMutation({ mutationFn: () => createReferenceData(form), onSuccess: () => { setOpen(false); setForm({ category: "COUNTRY", code: "", label: "", source: "Workspace maintained", version: "1" }); client.invalidateQueries({ queryKey: ["reference-data"] }); } });
  const items = useMemo(() => (result.data?.items || []) as ReferenceItem[], [result.data]);
  const categories = useMemo(() => [{ value: "all", label: "Semua kategori" }, ...Array.from(new Set(items.map((item) => item.category))).sort().map((value) => ({ value, label: value }))], [items]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return items.filter((item) => (category === "all" || item.category === category) && (!needle || [item.category, item.code, item.label, item.source, item.version].some((value) => value.toLowerCase().includes(needle)))); }, [category, items, query]);
  return <div className="operations-page cf-reference-data-page">
    <PageHeader icon={ReferenceIcon} title="Reference data" description="Kode dan label referensi yang dipakai oleh workspace agar field operasional konsisten dan memiliki provenance." actions={<Button icon={Plus} onClick={() => setOpen(true)}>Tambah entri</Button>} />
    <StateNotice title="Data reference bersifat workspace-scoped" tone="info">Source dan version disimpan bersama entri. Gunakan code stabil agar evaluasi dan audit dapat dirujuk dengan konsisten.</StateNotice>
    <section className="cf-reference-toolbar"><div className="cf-job-search"><Search size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kategori, code, label, atau source" aria-label="Cari reference data" /></div><AppSelect ariaLabel="Filter kategori reference data" value={category} onValueChange={setCategory} options={categories} /></section>
    <DataTableSurface title="Entri reference workspace" description={`${filtered.length} dari ${items.length} entri. Nilai source dan version selalu ditampilkan untuk reviewer.`}>{result.isLoading ? <div className="cf-table-loading">Memuat reference data…</div> : result.error ? <EmptyState icon={<ReferenceIcon size={18} />} title="Reference data tidak dapat dimuat" description={result.error instanceof Error ? result.error.message : "Coba muat ulang data referensi."} /> : !filtered.length ? <EmptyState icon={<ReferenceIcon size={18} />} title="Tidak ada entri yang cocok" description="Ubah kata kunci atau filter kategori untuk mencari nilai lain." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Kategori</Table.Head><Table.Head>Code</Table.Head><Table.Head>Label</Table.Head><Table.Head>Source</Table.Head><Table.Head>Version</Table.Head><Table.Head>State</Table.Head></Table.Row></Table.Header><Table.Body>{filtered.map((item) => <Table.Row key={item.id}><Table.Cell><span className="table-cell-primary">{item.category}</span></Table.Cell><Table.Cell><span className="mono">{item.code}</span></Table.Cell><Table.Cell>{item.label}</Table.Cell><Table.Cell>{item.source}</Table.Cell><Table.Cell><span className="mono">{item.version}</span></Table.Cell><Table.Cell><OperationalState value={item.active ? "ACTIVE" : "INACTIVE"} /></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface>
    {open ? <Dialog.Root open onOpenChange={(next) => setOpen(next)}><Dialog className="cf-reference-dialog" size="base"><Dialog.Title>Tambah reference entry</Dialog.Title><Dialog.Description>Gunakan code stabil, source yang dapat diverifikasi, dan version yang dapat direview.</Dialog.Description><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-grid"><Input label="Kategori" required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value.toUpperCase() })} /><Input label="Code" required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /><Input label="Label" required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /><Input label="Source" required value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /><Input label="Version" required value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></div>{mutation.isError ? <p className="form-error" role="alert">{(mutation.error as Error).message}</p> : null}<div className="form-panel__actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Menyimpan…" : "Simpan entri"}</Button></div></form></Dialog></Dialog.Root> : null}
  </div>;
}
