"use client";

import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Table } from "@cloudflare/kumo/components/table";
import { ArrowLeftIcon as ArrowLeft, ListChecksIcon as RulesIcon, PlayIcon as Play, WarningCircleIcon as Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { ContextRail, KeyValueList, OperationalState, RailSection, StateNotice } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { AppTextarea } from "@/components/ui/textarea";
import { fetchRulePack, publishRulePack, simulateRulePack } from "@/lib/api";

type RulePack = { id: string; name: string; version: string; scope: string; status: string; organization_id?: string | null; effective_from?: string | null; effective_to?: string | null; published_by?: string | null; published_at?: string | null };
type Rule = { id: string; rule_id: string; name: string; description: string; active: boolean; condition?: Record<string, unknown> };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Belum ditetapkan";

function PublishDialog({ pack, isPending, error, onClose, onConfirm }: { pack: RulePack; isPending: boolean; error: Error | null; onClose: () => void; onConfirm: () => void }) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}><Dialog className="cf-publish-rule-dialog" size="base"><div className="flex items-start gap-3"><Warning className="mt-0.5 text-kumo-warning" size={20} /><div><Dialog.Title>Publish versi immutable?</Dialog.Title><Dialog.Description>Versi {pack.version} akan menjadi PUBLISHED dan tidak dapat diubah melalui GateGuard.</Dialog.Description></div></div><StateNotice title="Konsekuensi publish" tone="warning">Assurance check sesudah publish akan menyimpan versi policy ini sebagai basis keputusan. Jika policy perlu diperbaiki, buat versi baru; jangan menganggap simulasi sebagai pengganti review.</StateNotice>{error ? <p className="form-error">{error.message}</p> : null}<div className="form-panel__actions"><Button variant="secondary" onClick={onClose} disabled={isPending}>Batal</Button><Button variant="primary" onClick={onConfirm} disabled={isPending}>{isPending ? "Mempublish…" : "Publish versi ini"}</Button></div></Dialog></Dialog.Root>;
}

export default function RulePackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [publishOpen, setPublishOpen] = useState(false);
  const [simulationInput, setSimulationInput] = useState("{}\n");
  const result = useQuery({ queryKey: ["rule-pack", id], queryFn: () => fetchRulePack(id) });
  const publish = useMutation({ mutationFn: () => publishRulePack(id), onSuccess: () => { setPublishOpen(false); client.invalidateQueries({ queryKey: ["rule-pack", id] }); client.invalidateQueries({ queryKey: ["rule-packs"] }); } });
  const simulate = useMutation({ mutationFn: () => simulateRulePack(id, JSON.parse(simulationInput)) });
  if (result.isPending) return <div className="page-loading">Memuat rule pack…</div>;
  if (result.isError || !result.data) return <div role="alert" className="notice notice--danger">Rule pack ini tidak dapat dimuat.</div>;
  const pack = result.data.rule_pack as RulePack;
  const rules = result.data.rules as Rule[];
  const source = pack.organization_id ? "Workspace" : "Shared baseline";

  return <div className="operations-page cf-rule-pack-detail">
    <Link className="back-link" href="/governance/rule-packs"><ArrowLeft size={15} /> Kembali ke rule packs</Link>
    <PageHeader icon={RulesIcon} title={pack.name} description={`Versi ${pack.version} · ${pack.scope} · ${source}`} actions={pack.status === "DRAFT" ? <Button variant="primary" onClick={() => setPublishOpen(true)}>Publish rule pack</Button> : <OperationalState value={pack.status} />} />
    <div className="cf-integration-layout">
      <DataTableSurface title="Rules pada pack ini" description="Published rule packs immutable; condition deterministik berikut dilampirkan pada keputusan assurance.">{!rules.length ? <EmptyState icon={<RulesIcon size={18} />} title="Belum ada rule" description="Tambahkan definisi rule sebelum publish versi ini." /> : <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Rule ID</Table.Head><Table.Head>Nama</Table.Head><Table.Head>Deskripsi</Table.Head><Table.Head>State</Table.Head><Table.Head>Condition</Table.Head></Table.Row></Table.Header><Table.Body>{rules.map((rule) => <Table.Row key={rule.id}><Table.Cell><span className="table-cell-primary mono">{rule.rule_id}</span></Table.Cell><Table.Cell>{rule.name}</Table.Cell><Table.Cell><span className="cf-rule-description">{rule.description}</span></Table.Cell><Table.Cell><OperationalState value={rule.active ? "ACTIVE" : "INACTIVE"} /></Table.Cell><Table.Cell><span className="cf-rule-condition mono">{Object.keys(rule.condition || {}).length ? JSON.stringify(rule.condition) : "—"}</span></Table.Cell></Table.Row>)}</Table.Body></Table></div>}</DataTableSurface>
      <ContextRail title="Governance context"><RailSection title="Versi policy"><KeyValueList items={[{ label: "Status", value: <OperationalState value={pack.status} /> }, { label: "Source", value: source }, { label: "Scope", value: pack.scope }, { label: "Effective from", value: date(pack.effective_from) }, { label: "Published at", value: date(pack.published_at) }, { label: "Publisher ID", value: <span className="mono">{pack.published_by || "Belum dipublish"}</span> }]} /></RailSection><p className="cf-rail-muted">Publishing tidak mengganti versi rule yang sudah dipakai oleh assurance terdahulu.</p></ContextRail>
    </div>
    <section className="cf-rule-simulation"><div><h2 className="cf-section-title">Simulasi policy</h2><p className="cf-metadata">Menjalankan rule deterministik terhadap input JSON. Ini bukan benchmark OCR/model dan tidak menggantikan evaluasi dokumen produksi.</p></div><AppTextarea label="Input JSON" value={simulationInput} onChange={(event) => setSimulationInput(event.target.value)} rows={7} description="Berikan fixture atau payload contoh yang tidak berisi secret." /><div className="cf-rule-simulation__actions"><Button icon={Play} variant="secondary" onClick={() => simulate.mutate()} disabled={simulate.isPending}>{simulate.isPending ? "Menjalankan…" : "Jalankan simulasi"}</Button>{simulate.isError ? <span className="form-error">{(simulate.error as Error).message}</span> : null}</div>{simulate.data ? <pre className="cf-safe-config">{JSON.stringify(simulate.data, null, 2)}</pre> : null}</section>
    {publishOpen ? <PublishDialog pack={pack} isPending={publish.isPending} error={publish.error as Error | null} onClose={() => setPublishOpen(false)} onConfirm={() => publish.mutate()} /> : null}
  </div>;
}
