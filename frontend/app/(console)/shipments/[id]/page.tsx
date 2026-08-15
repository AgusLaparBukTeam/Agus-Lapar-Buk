"use client";

import { ArrowLeftIcon as ArrowLeft, PackageIcon as Package, ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";
import { Table } from "@cloudflare/kumo/components/table";
import { Tabs } from "@cloudflare/kumo/components/tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ContextRail, KeyValueList, OperationalState, RailSection } from "@/components/ui/operational-primitives";
import { PageHeader } from "@/components/ui/page-header";
import { CloudflarePageShell, DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { AppTextarea } from "@/components/ui/textarea";
import { decideRelease, fetchMe, fetchWorkspaceShipment, transitionShipment } from "@/lib/api";

const labels: Record<string, string> = { DRAFT: "Draf", DOCUMENTS_REQUIRED: "Dokumen diperlukan", REVIEW_REQUIRED: "Perlu REVIEW", HOLD: "HOLD", RELEASE_PENDING_APPROVAL: "Menunggu persetujuan kedua", RELEASE_AUTHORIZED: "Pelepasan diizinkan", RELEASE_INVALIDATED: "Pelepasan perlu REVIEW", DISPATCHED: "Dikirim", CLOSED: "Ditutup" };
const tabs = ["Ringkasan", "Dokumen", "Barang", "Pihak", "Transport", "Jaminan", "Pengecualian", "Timeline"] as const;
type Tab = (typeof tabs)[number];
type Row = Record<string, unknown>;

function value(row: Row | undefined, key: string, fallback = "Belum tersedia") { const result = row?.[key]; return result === null || result === undefined || result === "" ? fallback : String(result); }
function date(value: unknown) { return value ? new Date(String(value)).toLocaleString("id-ID") : "Belum tersedia"; }
function localStatus(status: string) { return labels[status] || status; }

export default function ShipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("Ringkasan");
  const [reason, setReason] = useState("");
  const workspace = useQuery({ queryKey: ["shipment-workspace", id], queryFn: () => fetchWorkspaceShipment(id) });
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const decision = useMutation({ mutationFn: (decisionValue: "AUTHORIZE" | "HOLD") => decideRelease(id, { decision: decisionValue, reason }), onSuccess: () => { setReason(""); client.invalidateQueries({ queryKey: ["shipment-workspace", id] }); client.invalidateQueries({ queryKey: ["work-queue"] }); } });
  const move = useMutation({ mutationFn: (status: string) => transitionShipment(id, status), onSuccess: () => client.invalidateQueries({ queryKey: ["shipment-workspace", id] }) });

  if (workspace.isPending) return <CloudflarePageShell><div className="page-loading">Memuat detail pengiriman…</div></CloudflarePageShell>;
  if (workspace.isError || !workspace.data) return <CloudflarePageShell><div role="alert" className="notice notice--danger">Detail pengiriman tidak dapat dimuat.</div></CloudflarePageShell>;

  const data = workspace.data as Row;
  const shipment = data.shipment as Row;
  const status = value(shipment, "status", "DRAFT");
  const canDecide = me.data?.role === "admin" || me.data?.role === "supervisor";
  const list = (key: string) => Array.isArray(data[key]) ? data[key] as Row[] : [];
  const gate = list("release_gate");
  const rows = (items: Row[], columns: Array<[string, string]>) => items.length ? <div className="table-scroll"><Table><Table.Header sticky><Table.Row>{columns.map(([key, heading]) => <Table.Head key={key}>{heading}</Table.Head>)}</Table.Row></Table.Header><Table.Body>{items.map((row, index) => <Table.Row key={String(row.id || index)}>{columns.map(([key]) => <Table.Cell key={key}>{key === "created_at" || key.endsWith("_at") ? date(row[key]) : value(row, key)}</Table.Cell>)}</Table.Row>)}</Table.Body></Table></div> : <EmptyState title="Belum ada record" description="Informasi akan tampil ketika pengiriman dipersiapkan." />;
  const actionDisabled = decision.isPending || reason.trim().length < 5 || Number(shipment.open_tasks || 0) > 0;

  return <CloudflarePageShell className="cf-shipment-detail-page">
    <Link className="back-link" href="/shipments"><ArrowLeft size={15} /> Kembali ke pengiriman</Link>
    <PageHeader icon={Package} title={value(shipment, "internal_reference")} description={`${value(shipment, "origin")} → ${value(shipment, "destination")}`} actions={<OperationalState value={localStatus(status)} />} />
    <div className="cf-shipment-detail-layout">
      <main className="cf-shipment-detail-main">
        <Tabs tabs={tabs.map((itemTab) => ({ value: itemTab, label: itemTab }))} value={tab} onValueChange={(next) => setTab(next as Tab)} className="detail-tabs" aria-label="Bagian pengiriman" />
        {tab === "Ringkasan" && <div className="cf-shipment-overview-stack">
          <DataTableSurface title="Ringkasan pengiriman" description="Konteks yang dipakai untuk pemeriksaan dan keputusan pelepasan." actions={<ShieldCheck size={19} aria-hidden="true" />}><dl className="cf-shipment-summary-grid"><div><dt>Referensi pesanan</dt><dd>{value(shipment, "external_reference")}</dd></div><div><dt>Moda transportasi</dt><dd>{value(shipment, "transport_mode")}</dd></div><div><dt>Prioritas</dt><dd>{value(shipment, "priority")}</dd></div><div><dt>Tingkat risiko</dt><dd>{value(shipment, "risk_level")}</dd></div><div><dt>Mata uang</dt><dd>{value(shipment, "currency")}</dd></div><div><dt>Assessment terakhir</dt><dd>{date(shipment.last_assessed_at)}</dd></div></dl></DataTableSurface>
          <DataTableSurface title="Release gate" description="Setiap kondisi harus didukung bukti sebelum pengiriman dapat dilepas.">{gate.length ? <div className="cf-release-gate-list">{gate.map((entry) => <div key={String(entry.key)}><span>{String(entry.label)}</span><OperationalState value={String(entry.state)} /></div>)}</div> : <EmptyState title="Belum ada evaluasi release gate" description="Jalankan assessment setelah dokumen dan referensi tersedia." />}</DataTableSurface>
        </div>}
        {tab === "Dokumen" && <DataTableSurface title="Document vault" description="Bukti terversi yang terikat pada pengiriman.">{rows(list("documents"), [["document_type", "Jenis"], ["status", "Status"], ["created_at", "Ditambahkan"], ["updated_at", "Diperbarui"]])}</DataTableSurface>}
        {tab === "Barang" && <DataTableSurface title="Barang dan komoditas" description="Klasifikasi dan informasi dangerous goods yang direkam untuk pergerakan ini.">{rows(list("items"), [["line_number", "Baris"], ["sku", "SKU"], ["description", "Deskripsi"], ["quantity", "Jumlah"], ["hs_code", "HS code"], ["dangerous_goods", "Dangerous goods"]])}</DataTableSurface>}
        {tab === "Pihak" && <DataTableSurface title="Pihak terkait" description="Entitas perdagangan yang terhubung ke pengiriman.">{rows(list("parties").map((row) => ({ ...row, legal_name: (row.party as Row | undefined)?.legal_name, country_code: (row.party as Row | undefined)?.country_code })), [["role", "Peran"], ["legal_name", "Pihak"], ["country_code", "Negara"]])}</DataTableSurface>}
        {tab === "Transport" && <DataTableSurface title="Rencana transportasi" description="Leg, carrier, dan peralatan yang tercatat untuk pengiriman.">{rows(list("transport"), [["sequence", "Leg"], ["mode", "Moda"], ["carrier", "Carrier"], ["origin", "Asal"], ["destination", "Tujuan"], ["planned_arrival", "Estimasi tiba"]])}</DataTableSurface>}
        {tab === "Jaminan" && <DataTableSurface title="Pemeriksaan jaminan" description="Check mempertahankan sumber dan versi rule untuk review.">{rows(list("checks"), [["check_type", "Check"], ["status", "Status"], ["severity", "Severity"], ["source", "Sumber"], ["completed_at", "Dievaluasi"]])}</DataTableSurface>}
        {tab === "Pengecualian" && <DataTableSurface title="Pengecualian" description="Temuan yang membutuhkan resolusi terdokumentasi.">{rows(list("exceptions"), [["severity", "Severity"], ["summary", "Pengecualian"], ["status", "Status"], ["assigned_to", "Penanggung jawab"], ["due_at", "Jatuh tempo"]])}</DataTableSurface>}
        {tab === "Timeline" && <DataTableSurface title="Timeline pengiriman" description="Waktu pada record berasal dari event dan lifecycle yang tersimpan.">{rows([shipment], [["created_at", "Dibuat"], ["assessment_started_at", "Assessment dimulai"], ["last_assessed_at", "Assessment terakhir"], ["release_authorized_at", "Pelepasan diizinkan"], ["dispatched_at", "Dikirim"], ["closed_at", "Ditutup"]])}</DataTableSurface>}
      </main>
      <ContextRail title="Konteks pengiriman">
        <RailSection title="Status saat ini"><OperationalState value={localStatus(status)} /></RailSection>
        <RailSection title="Identitas"><KeyValueList items={[{ label: "Referensi internal", value: value(shipment, "internal_reference") }, { label: "Referensi eksternal", value: value(shipment, "external_reference") }, { label: "Pemilik", value: value(shipment, "owner_name", "Belum ditetapkan") }]} /></RailSection>
        <RailSection title="Keputusan"><KeyValueList items={[{ label: "Pemeriksaan terbuka", value: String(shipment.open_tasks || 0) }, { label: "Risiko", value: value(shipment, "risk_level") }, { label: "Diperbarui", value: date(shipment.updated_at) }]} /></RailSection>
        <RailSection title="Tindakan yang diizinkan">
          {canDecide ? <div className="cf-rail-action-stack"><AppTextarea label="Catatan keputusan" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Catat bukti yang mendukung keputusan" minLength={5} description="Minimal 5 karakter. Catatan disimpan pada record keputusan." />{decision.isError && <p role="alert" className="form-error">{(decision.error as Error).message}</p>}{move.isError && <p role="alert" className="form-error">{(move.error as Error).message}</p>}<Button variant="secondary" disabled={decision.isPending || reason.trim().length < 5} onClick={() => decision.mutate("HOLD")}>Tahan pengiriman</Button><Button disabled={actionDisabled} onClick={() => decision.mutate("AUTHORIZE")}>Otorisasi pelepasan</Button>{status === "RELEASE_AUTHORIZED" && <Button disabled={move.isPending} onClick={() => move.mutate("DISPATCHED")}>Tandai dikirim</Button>}{status === "DISPATCHED" && <Button disabled={move.isPending} onClick={() => move.mutate("CLOSED")}>Tutup pengiriman</Button>}</div> : <p className="cf-rail-muted">Reviewer atau administrator dapat merekam keputusan lifecycle.</p>}
        </RailSection>
      </ContextRail>
    </div>
  </CloudflarePageShell>;
}
