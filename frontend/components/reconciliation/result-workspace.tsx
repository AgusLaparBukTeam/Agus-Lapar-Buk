"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Table } from "@cloudflare/kumo/components/table";
import { CaretDownIcon as CaretDown, ShieldCheckIcon as ShieldCheck, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { DataTableSurface, EmptyState } from "@/components/ui/page-primitives";
import { AppSelect } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppTextarea } from "@/components/ui/textarea";
import { fetchMe, overrideDecision } from "@/lib/api";
import type { DocumentType, Mismatch, ReconciliationResult, ReconciliationStatus } from "@/lib/types";

const docLabels: Record<DocumentType, string> = {
  delivery_order: "Surat Jalan",
  invoice: "Invoice",
  packing_list: "Packing List",
};

function severityVariant(severity: string): "error" | "warning" | "neutral" {
  if (severity === "CRITICAL" || severity === "HIGH") return "error";
  if (severity === "MEDIUM") return "warning";
  return "neutral";
}

export function ResultWorkspace({
  initialResult,
  files,
  onReset,
}: {
  initialResult: ReconciliationResult;
  files: Record<DocumentType, File>;
  onReset: () => void;
}) {
  const [result, setResult] = useState(initialResult);
  const [selected, setSelected] = useState<Mismatch | null>(result.mismatches[0] || null);
  const [docType, setDocType] = useState<DocumentType>(selected?.evidence[0]?.document_type || "delivery_order");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const effectiveStatus = result.audit.final_decision || result.effective_status || result.status;
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });
  const evidence = useMemo(() => selected?.evidence.filter((item) => item.document_type === docType).flatMap((item) => item.evidence) || [], [selected, docType]);

  function chooseMismatch(mismatch: Mismatch) {
    setSelected(mismatch);
    if (mismatch.evidence[0]) setDocType(mismatch.evidence[0].document_type);
  }

  return <div className="cf-reconciliation-workspace">
    <header className="cf-reconciliation-header">
      <div className="cf-reconciliation-header__inner">
        <div className="cf-reconciliation-header__summary">
          <StatusBadge status={effectiveStatus} />
          <div className="min-w-0">
            <p className="cf-reconciliation-header__reason">{result.reason}</p>
            <p className="cf-metadata">{result.mismatches.length} isu · {result.processing_ms} ms · <span className="mono">{result.session_id.slice(0, 8)}</span></p>
          </div>
        </div>
        <div className="cf-reconciliation-header__actions">
          <Button variant="secondary" onClick={onReset}>Rekonsiliasi baru</Button>
          {(user?.role === "supervisor" || user?.role === "admin") && <Button variant={effectiveStatus === "HOLD" ? "danger" : "primary"} onClick={() => setOverrideOpen(true)}>Override supervisor</Button>}
        </div>
      </div>
    </header>

    <main className="cf-reconciliation-grid">
      <div><DocumentViewer files={files} selectedType={docType} onType={setDocType} evidence={evidence} /></div>
      <aside className="cf-reconciliation-aside">
        <DataTableSurface title="Temuan rekonsiliasi" description={result.recommended_action} actions={<span className="cf-metadata">{result.mismatches.length} temuan</span>}>
          {result.mismatches.length === 0 ? <EmptyState icon={<ShieldCheck size={18} />} title="Tidak ada konflik material" description="Tidak ada konflik material yang terdeteksi pada dokumen ini." /> : <div className="cf-finding-list">
            {result.mismatches.map((mismatch) => <Button key={mismatch.id} type="button" variant="ghost" onClick={() => chooseMismatch(mismatch)} className={`cf-finding-list__item ${selected?.id === mismatch.id ? "cf-finding-list__item--selected" : ""}`}>
              <span className="cf-finding-list__copy"><span className="cf-finding-list__heading"><span>{mismatch.type.replaceAll("_", " ")}</span><Badge appearance="dot" variant={severityVariant(mismatch.severity)}>{mismatch.severity}</Badge></span><span className="cf-finding-list__description">{mismatch.explanation}</span></span>
            </Button>)}
          </div>}
        </DataTableSurface>

        {selected && <DataTableSurface className="cf-evidence-surface" title="Perbandingan bukti">
          <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Dokumen</Table.Head><Table.Head>Nilai</Table.Head><Table.Head>Tingkat keyakinan</Table.Head></Table.Row></Table.Header><Table.Body>{selected.evidence.map((item, index) => <Table.Row key={`${item.document_type}-${index}`}><Table.Cell>{docLabels[item.document_type]}</Table.Cell><Table.Cell><span className="table-cell-primary break-words">{String(item.value ?? "—")}</span></Table.Cell><Table.Cell><span className="mono">{Math.round(item.confidence * 100)}%</span></Table.Cell></Table.Row>)}</Table.Body></Table></div>
          {selected.estimated_discrepancy_value != null && <div className="cf-evidence-surface__estimate">Estimasi nilai selisih: <span className="table-cell-primary">Rp {selected.estimated_discrepancy_value.toLocaleString("id-ID")}</span>{selected.estimate_price_source ? ` · harga dari ${docLabels[selected.estimate_price_source]}` : ""}</div>}
          <details className="cf-evidence-details"><summary>Sumber bukti & detail teknis <CaretDown size={14} /></summary><div>{selected.evidence.map((item, index) => <p key={index}><span className="table-cell-primary">{docLabels[item.document_type]}</span>{" · "}{item.field} · {item.evidence.length} area bukti</p>)}</div></details>
        </DataTableSurface>}

        {result.audit.final_decision && <section className="notice notice--info reconciliation-audit"><p className="table-cell-primary">Override tercatat: {result.audit.final_decision}</p><p>{result.audit.override_reason}</p>{result.audit.overridden_by && <p>Supervisor: {result.audit.overridden_by}</p>}<p>Keputusan sistem asli tetap: {result.audit.system_decision} · {result.audit.override_history.length} peristiwa audit</p></section>}
      </aside>
    </main>

    {overrideOpen && <OverrideDialog sessionId={result.session_id} systemDecision={result.audit.system_decision} onClose={() => setOverrideOpen(false)} onSaved={(updated) => { setResult(updated); setOverrideOpen(false); }} />}
  </div>;
}

function OverrideDialog({
  sessionId,
  systemDecision,
  onClose,
  onSaved,
}: {
  sessionId: string;
  systemDecision: ReconciliationStatus;
  onClose: () => void;
  onSaved: (result: ReconciliationResult) => void;
}) {
  const [decision, setDecision] = useState<ReconciliationStatus>(systemDecision);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => overrideDecision(sessionId, { final_decision: decision, reason }),
    onSuccess: (data) => { toast.success("Override tersimpan"); onSaved(data); },
    onError: (error: Error) => toast.error(error.message),
  });

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog className="override-dialog" size="base">
      <div className="flex items-start gap-3"><WarningCircle className="mt-0.5 text-kumo-warning" size={20} /><div><Dialog.Title>Override keputusan sistem</Dialog.Title><Dialog.Description>Keputusan sistem asli akan tetap disimpan untuk audit.</Dialog.Description></div></div>
      <p className="override-dialog__notice">Identitas pemberi override diambil dari akun supervisor yang sedang login dan dicatat otomatis.</p>
      <label className="override-dialog__field">Keputusan akhir<AppSelect ariaLabel="Keputusan akhir" value={decision} onValueChange={(value) => setDecision(value as ReconciliationStatus)} options={[{ value: "CLEAR", label: "CLEAR" }, { value: "REVIEW", label: "REVIEW" }, { value: "HOLD", label: "HOLD" }]} /></label>
      <AppTextarea label="Alasan override" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} maxLength={1000} placeholder="Jelaskan verifikasi atau koreksi yang dilakukan…" description="Minimal 5 karakter. Catatan ini tersimpan pada audit trail." />
      <div className="form-panel__actions"><Button variant="secondary" onClick={onClose}>Batal</Button><Button variant="primary" onClick={() => mutation.mutate()} disabled={reason.trim().length < 5 || mutation.isPending}>{mutation.isPending ? "Menyimpan…" : "Simpan override"}</Button></div>
    </Dialog>
  </Dialog.Root>;
}
