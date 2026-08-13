"use client";

import { CaretDownIcon as CaretDown, ShieldCheckIcon as ShieldCheck, WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
import { AppTextarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/ui/select";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Table } from "@cloudflare/kumo/components/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { overrideDecision } from "@/lib/api";
import { fetchMe } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { DocumentType, Mismatch, ReconciliationResult, ReconciliationStatus } from "@/lib/types";

const docLabels: Record<DocumentType, string> = {
  delivery_order: "Surat Jalan",
  invoice: "Invoice",
  packing_list: "Packing List",
};

function severityClass(severity: string) {
  if (severity === "CRITICAL" || severity === "HIGH") return "text-kumo-danger bg-kumo-danger-tint border-kumo-danger";
  if (severity === "MEDIUM") return "text-kumo-warning bg-kumo-warning-tint border-kumo-warning";
  return "text-kumo-neutral-750 bg-kumo-recessed border-kumo-line";
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
  const [docType, setDocType] = useState<DocumentType>(
    selected?.evidence[0]?.document_type || "delivery_order",
  );
  const [overrideOpen, setOverrideOpen] = useState(false);
  const effectiveStatus = result.audit.final_decision || result.effective_status || result.status;
  const { data: user } = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe });

  const evidence = useMemo(() =>
    selected?.evidence
      .filter((e) => e.document_type === docType)
      .flatMap((e) => e.evidence) || [], [selected, docType]);

  function chooseMismatch(mismatch: Mismatch) {
    setSelected(mismatch);
    if (mismatch.evidence[0]) setDocType(mismatch.evidence[0].document_type);
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-kumo-line bg-kumo-base">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StatusBadge status={effectiveStatus} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{result.reason}</div>
              <div className="text-sm text-kumo-neutral-750">
                {result.mismatches.length} isu · {result.processing_ms} ms · <span className="mono">{result.session_id.slice(0, 8)}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onReset}>Rekonsiliasi baru</Button>
            {(user?.role === "supervisor" || user?.role === "admin") && <Button variant={effectiveStatus === "HOLD" ? "danger" : "primary"} onClick={() => setOverrideOpen(true)}>Override supervisor</Button>}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-12 lg:p-6">
        <div className="lg:col-span-7">
          <DocumentViewer files={files} selectedType={docType} onType={setDocType} evidence={evidence} />
        </div>

        <aside className="lg:col-span-5">
          <section className="rounded-md border border-kumo-line bg-kumo-base">
            <div className="border-b border-kumo-line p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Temuan rekonsiliasi</h2>
                <span className="text-sm text-kumo-neutral-750">{result.mismatches.length} temuan</span>
              </div>
              <p className="mt-1 text-sm text-kumo-neutral-750">{result.recommended_action}</p>
            </div>

            {result.mismatches.length === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-kumo-success">
                <ShieldCheck size={18} /> Tidak ada konflik material yang terdeteksi.
              </div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {result.mismatches.map((mismatch) => (
                  <Button
                    key={mismatch.id}
                    type="button"
                    variant="ghost"
                    onClick={() => chooseMismatch(mismatch)}
                    className={`h-auto w-full justify-start rounded-none border-b border-kumo-line p-3 text-left last:border-0 ${selected?.id === mismatch.id ? "bg-kumo-recessed" : ""}`}
                  >
                    <span className="block w-full">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{mismatch.type.replaceAll("_", " ")}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-sm font-medium ${severityClass(mismatch.severity)}`}>{mismatch.severity}</span>
                      </span>
                      <span className="mt-1 block text-sm text-kumo-neutral-750">{mismatch.explanation}</span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="mt-3 overflow-hidden rounded-md border border-kumo-line bg-kumo-base">
              <div className="border-b border-kumo-line px-3 py-2.5">
                <h3 className="text-sm font-semibold">Perbandingan bukti</h3>
              </div>
              <div className="table-scroll">
                <Table>
                  <Table.Header sticky><Table.Row><Table.Head>Dokumen</Table.Head><Table.Head>Nilai</Table.Head><Table.Head>Tingkat keyakinan</Table.Head></Table.Row></Table.Header>
                  <Table.Body>
                    {selected.evidence.map((ev, index) => (
                      <Table.Row key={`${ev.document_type}-${index}`}>
                        <Table.Cell>{docLabels[ev.document_type]}</Table.Cell>
                        <Table.Cell><strong className="break-words">{String(ev.value ?? "—")}</strong></Table.Cell>
                        <Table.Cell><span className="mono">{Math.round(ev.confidence * 100)}%</span></Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
              {selected.estimated_discrepancy_value != null && (
                <div className="border-t border-kumo-line bg-kumo-warning-tint px-3 py-2 text-sm text-kumo-warning">
                  Estimasi nilai selisih: <strong>Rp {selected.estimated_discrepancy_value.toLocaleString("id-ID")}</strong>
                  {selected.estimate_price_source ? ` · harga dari ${docLabels[selected.estimate_price_source]}` : ""}
                </div>
              )}
              <details className="border-t border-kumo-line">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium">
                  Sumber bukti & detail teknis <CaretDown size={14} />
                </summary>
                <div className="space-y-2 px-3 pb-3 text-sm text-kumo-neutral-750">
                  {selected.evidence.map((ev, i) => (
                    <div key={i}>
                      <span className="font-medium text-kumo-contrast">{docLabels[ev.document_type]}</span>
                      {" · "}{ev.field} · {ev.evidence.length} area bukti
                    </div>
                  ))}
                </div>
              </details>
            </section>
          )}

          {result.audit.final_decision && (
            <section className="mt-3 rounded-md border border-kumo-info bg-kumo-info-tint p-3 text-sm text-kumo-info">
              <div className="font-semibold">Override tercatat: {result.audit.final_decision}</div>
              <div className="mt-1">{result.audit.override_reason}</div>
              {result.audit.overridden_by && (
                <div className="mt-1 text-kumo-info">Supervisor: {result.audit.overridden_by}</div>
              )}
              <div className="mt-1 text-kumo-info">
                Keputusan sistem asli tetap: {result.audit.system_decision} · {result.audit.override_history.length} peristiwa audit
              </div>
            </section>
          )}
        </aside>
      </main>

      {overrideOpen && (
        <OverrideDialog
          sessionId={result.session_id}
          systemDecision={result.audit.system_decision}
          onClose={() => setOverrideOpen(false)}
          onSaved={(updated) => { setResult(updated); setOverrideOpen(false); }}
        />
      )}
    </div>
  );
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
    mutationFn: () => overrideDecision(
      sessionId,
      { final_decision: decision, reason },
    ),
    onSuccess: (data) => { toast.success("Override tersimpan"); onSaved(data); },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog className="override-dialog" size="base">
        <div className="flex items-start gap-3">
          <WarningCircle className="mt-0.5 text-kumo-warning" size={20} />
          <div>
            <Dialog.Title>Override keputusan sistem</Dialog.Title>
            <Dialog.Description>Keputusan sistem asli akan tetap disimpan untuk audit.</Dialog.Description>
          </div>
        </div>
        <p className="override-dialog__notice">Identitas pemberi override diambil dari akun supervisor yang sedang login dan dicatat otomatis.</p>
        <label className="override-dialog__field">
          Keputusan akhir
          <AppSelect ariaLabel="Keputusan akhir" value={decision} onValueChange={(value) => setDecision(value as ReconciliationStatus)} options={[{ value: "CLEAR", label: "CLEAR" }, { value: "REVIEW", label: "REVIEW" }, { value: "HOLD", label: "HOLD" }]} />
        </label>
        <AppTextarea
          label="Alasan override"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Jelaskan verifikasi atau koreksi yang dilakukan…"
          description="Minimal 5 karakter. Catatan ini tersimpan pada audit trail."
        />
        <div className="form-panel__actions">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 5 || mutation.isPending}
          >
            {mutation.isPending ? "Menyimpan…" : "Simpan override"}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
