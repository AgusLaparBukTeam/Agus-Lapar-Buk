"use client";

import { Input } from "@cloudflare/kumo/components/input";
import { Table } from "@cloudflare/kumo/components/table";
import { WebhooksLogoIcon as Webhooks, CopyIcon as Copy, WarningCircleIcon as Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { OperationalState, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { createWebhook, fetchWebhooks } from "@/lib/api";

type Webhook = { id: string; name: string; endpoint: string; events: string[]; enabled: boolean; secret_configured: boolean; delivery_capability: string; created_at?: string };

export default function WebhooksPage() {
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["webhooks"], queryFn: fetchWebhooks });
  const [form, setForm] = useState({ name: "", endpoint: "", events: "shipment.created,release.decision.recorded" });
  const mutation = useMutation({ mutationFn: () => createWebhook({ ...form, events: form.events.split(",").map((item) => item.trim()).filter(Boolean) }), onSuccess: () => { setForm({ name: "", endpoint: "", events: "shipment.created,release.decision.recorded" }); client.invalidateQueries({ queryKey: ["webhooks"] }); } });
  const items = useMemo(() => (result.data?.items || []) as Webhook[], [result.data]);
  const [secretCopied, setSecretCopied] = useState(false);
  async function copySecret() { await navigator.clipboard.writeText(String(mutation.data?.secret || "")); setSecretCopied(true); }

  return <div className="operations-page cf-webhooks-page">
    <PageHeader icon={Webhooks} title="Webhooks" description="Subscription endpoint dan signing secret untuk workspace aktif. Delivery bukan kapabilitas operasional saat ini." />
    <StateNotice title="Delivery Webhooks belum diimplementasikan" tone="warning" action={<Warning size={19} aria-hidden />}>Subscription dapat dibuat dan secret ditampilkan satu kali, tetapi GateGuard belum dispatch event, menyimpan delivery attempt, retry, atau failure history. Jangan gunakan subscription ini sebagai notifikasi produksi.</StateNotice>
    <DataTableSurface title="Subscriptions" description={`${items.length} endpoint terdaftar. Kolom kapabilitas menunjukkan kemampuan backend yang sebenarnya.`}>
      {result.isLoading ? <div className="cf-table-loading">Memuat subscription…</div> : result.error ? <EmptyState icon={<Webhooks size={18} />} title="Subscription tidak dapat dimuat" description={result.error instanceof Error ? result.error.message : "Coba muat ulang Webhooks."} /> : !items.length ? <EmptyState icon={<Webhooks size={18} />} title="Belum ada subscription" description="Endpoint yang terdaftar akan muncul di sini, tetapi belum menerima delivery dari GateGuard." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Nama</Table.Head><Table.Head>Endpoint</Table.Head><Table.Head>Jenis event</Table.Head><Table.Head>Status subscription</Table.Head><Table.Head>Signing secret</Table.Head><Table.Head>Kapabilitas delivery</Table.Head></Table.Row></Table.Header><Table.Body>{items.map((item) => <Table.Row key={item.id}><Table.Cell><span className="table-cell-primary">{item.name}</span></Table.Cell><Table.Cell><span className="cf-webhook-endpoint mono">{item.endpoint}</span></Table.Cell><Table.Cell><span className="cf-webhook-events">{item.events.length ? item.events.join(", ") : "Semua event"}</span></Table.Cell><Table.Cell><OperationalState value={item.enabled ? "ENABLED" : "DISABLED"} /></Table.Cell><Table.Cell><OperationalState value={item.secret_configured ? "CONFIGURED" : "MISSING"} /></Table.Cell><Table.Cell><OperationalState value={item.delivery_capability} /></Table.Cell></Table.Row>)}</Table.Body></Table></div>}
    </DataTableSurface>
    <section className="form-panel cf-webhook-form"><div className="form-panel__heading"><h2>Tambahkan subscription</h2><p>Endpoint harus tervalidasi. Pembuatan subscription tidak memulai dispatch event.</p></div><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-grid"><Input label="Nama" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Pembaruan gudang" /><Input label="Endpoint" required type="url" value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} placeholder="https://example.com/gateguard" /><Input label="Jenis event" description="Pisahkan nama event dengan koma." value={form.events} onChange={(event) => setForm({ ...form, events: event.target.value })} /></div>{mutation.data ? <StateNotice title="Simpan signing secret sekarang" tone="warning" action={<Button type="button" variant="secondary" size="sm" icon={Copy} onClick={copySecret}>{secretCopied ? "Tersalin" : "Salin"}</Button>}>Secret hanya muncul sekali dan tidak dapat diambil kembali. Simpan secara aman di secret manager endpoint tujuan.<span className="cf-one-time-token mono">{String(mutation.data.secret)}</span></StateNotice> : null}{mutation.isError ? <p className="form-error">{(mutation.error as Error).message}</p> : null}<div className="form-panel__actions"><Button type="submit" variant="primary" disabled={mutation.isPending}>{mutation.isPending ? "Menyimpan…" : "Buat subscription"}</Button></div></form></section>
  </div>;
}
