"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { PlugsConnectedIcon as Connections, PlusIcon as Plus, CopyIcon as Copy } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { ContextRail, KeyValueList, OperationalState, RailSection, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { createConnection, createServiceAccount, fetchMe, fetchOperationsList } from "@/lib/api";

type Connection = { id: string; name: string; type: string; status: string; configuration?: Record<string, unknown>; last_success_at?: string | null; last_error_at?: string | null; created_at?: string; updated_at?: string };
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum ada";
function health(connection: Connection) { if (connection.last_error_at) return "PERLU_PERHATIAN"; if (connection.last_success_at) return "TERHUBUNG"; return connection.status === "ENABLED" ? "MENUNGGU_AKTIVITAS" : "BELUM_AKTIF"; }

export default function ConnectionsPage() {
  const client = useQueryClient();
  const session = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const canManageConnections = session.data?.role === "admin";
  const result = useQuery({ queryKey: ["connections"], queryFn: () => fetchOperationsList("/integrations/connections"), enabled: canManageConnections });
  const [form, setForm] = useState({ name: "", type: "ERP", configuration: "{}" });
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const connection = useMutation({ mutationFn: () => createConnection({ name: form.name, type: form.type, configuration: JSON.parse(form.configuration) }), onSuccess: () => { setForm({ name: "", type: "ERP", configuration: "{}" }); client.invalidateQueries({ queryKey: ["connections"] }); } });
  const serviceAccount = useMutation({ mutationFn: () => createServiceAccount({ name: accountName, scopes: ["shipment.read", "shipment.write"] }), onSuccess: (data) => { setAccountName(""); setToken(String(data.token)); setTokenCopied(false); } });
  const items = useMemo(() => (result.data?.items || []) as Connection[], [result.data]);
  const selected = items.find((item) => item.id === selectedId) || items[0] || null;
  async function copyToken() { await navigator.clipboard.writeText(token); setTokenCopied(true); }

  return <div className="operations-page cf-connections-page">
    <PageHeader icon={Connections} title="Connections" description="Sistem bisnis dan partner service yang dikonfigurasi pada workspace aktif. Credential tidak pernah tampil pada register ini." />
    {!session.isPending && !canManageConnections ? <StateNotice title="Koneksi hanya tersedia untuk administrator." tone="warning">Operator tidak dapat melihat atau mengubah konfigurasi integrasi maupun membuat service token.</StateNotice> : <>
    {result.error ? <StateNotice title="Connections tidak dapat dimuat" tone="danger">{result.error instanceof Error ? result.error.message : "Coba muat ulang konfigurasi integrasi."}</StateNotice> : null}
    <div className="cf-integration-layout">
      <DataTableSurface title="Sistem terkonfigurasi" description={`${items.length} connection dalam workspace ini. Health hanya dihitung dari status dan timestamp yang tercatat.`} actions={<Button size="sm" variant="secondary" icon={Plus} onClick={() => document.getElementById("add-connection")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Tambah</Button>}>
        {result.isLoading ? <div className="cf-table-loading">Memuat connection…</div> : !items.length ? <EmptyState icon={<Connections size={18} />} title="Belum ada connection" description="Tambahkan sistem yang disetujui untuk mulai mencatat konfigurasi integrasi." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Nama</Table.Head><Table.Head>Provider / type</Table.Head><Table.Head>State</Table.Head><Table.Head>Health</Table.Head><Table.Head>Aktivitas terakhir</Table.Head><Table.Head aria-label="Aksi" /></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={item.id}><Table.Cell><span className="table-cell-primary">{item.name}</span></Table.Cell><Table.Cell>{item.type}</Table.Cell><Table.Cell><OperationalState value={item.status} /></Table.Cell><Table.Cell><OperationalState value={health(item)} /></Table.Cell><Table.Cell><span className="cf-table-date">{dateTime(item.last_success_at || item.last_error_at)}</span></Table.Cell><Table.Cell><Button size="sm" variant="secondary" onClick={() => setSelectedId(item.id)}>Konteks</Button></Table.Cell></Table.Row>)}</Table.Body></Table></div>}
      </DataTableSurface>
      <ContextRail title="Konteks connection">
        {!selected ? <p className="cf-rail-muted">Pilih connection untuk melihat konfigurasi aman dan aktivitasnya.</p> : <><RailSection title={selected.name}><KeyValueList items={[{ label: "Provider / type", value: selected.type }, { label: "State", value: <OperationalState value={selected.status} /> }, { label: "Health", value: <OperationalState value={health(selected)} /> }, { label: "Terakhir berhasil", value: dateTime(selected.last_success_at) }, { label: "Error terakhir", value: dateTime(selected.last_error_at) }]} /></RailSection><RailSection title="Konfigurasi aman"><pre className="cf-safe-config">{JSON.stringify(selected.configuration || {}, null, 2)}</pre></RailSection><p className="cf-rail-muted">Secret, credential reference, dan token tidak tersedia di browser.</p></>}
      </ContextRail>
    </div>
    <section id="add-connection" className="cf-integration-action-grid">
      <form className="form-panel" onSubmit={(event) => { event.preventDefault(); connection.mutate(); }}><div className="form-panel__heading"><h2>Tambahkan connection</h2><p>Connection baru dibuat dalam state DISABLED sampai konfigurasi operasional diselesaikan.</p></div><div className="form-grid"><Input label="Nama" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Sistem gudang" /><label>Provider / type<AppSelect ariaLabel="Tipe connection" value={form.type} onValueChange={(type) => setForm({ ...form, type })} options={[{ value: "ERP", label: "ERP" }, { value: "WMS", label: "WMS" }, { value: "Carrier", label: "Carrier" }, { value: "Screening provider", label: "Screening provider" }]} /></label></div>{connection.isError ? <p className="form-error">{(connection.error as Error).message}</p> : null}<div className="form-panel__actions"><Button type="submit" variant="primary" disabled={connection.isPending}>{connection.isPending ? "Menyimpan…" : "Tambah connection"}</Button></div></form>
      <form className="form-panel" onSubmit={(event) => { event.preventDefault(); serviceAccount.mutate(); }}><div className="form-panel__heading"><h2>Partner API access</h2><p>Service token ditampilkan sekali untuk disimpan langsung pada sistem partner.</p></div><Input label="Nama service account" required value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Inbound partner" />{token ? <StateNotice title="Simpan service token sekarang" tone="warning" action={<Button type="button" variant="secondary" size="sm" icon={Copy} onClick={copyToken}>{tokenCopied ? "Tersalin" : "Salin"}</Button>}>Token ini hanya ditampilkan sekali dan tidak dapat dipulihkan dari GateGuard setelah halaman ditutup.<span className="cf-one-time-token mono">{token}</span></StateNotice> : null}{serviceAccount.isError ? <p className="form-error">{(serviceAccount.error as Error).message}</p> : null}<div className="form-panel__actions"><Button type="submit" variant="primary" disabled={serviceAccount.isPending}>{serviceAccount.isPending ? "Membuat…" : "Buat service token"}</Button></div></form>
    </section>
    </>}
  </div>;
}
