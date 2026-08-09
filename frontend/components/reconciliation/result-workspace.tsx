"use client";

import { CaretDown, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DocumentViewer } from "@/components/document-viewer/document-viewer";
import { Button } from "@/components/ui/button";
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
  if (severity === "CRITICAL") return "text-red-700 bg-red-50 border-red-200";
  if (severity === "HIGH") return "text-orange-800 bg-orange-50 border-orange-200";
  if (severity === "MEDIUM") return "text-amber-900 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
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
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <StatusBadge status={effectiveStatus} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{result.reason}</div>
              <div className="text-xs text-[var(--subtle)]">
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
          <section className="rounded-lg border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] p-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Temuan rekonsiliasi</h2>
                <span className="text-xs text-[var(--subtle)]">{result.mismatches.length} temuan</span>
              </div>
              <p className="mt-1 text-xs text-[var(--subtle)]">{result.recommended_action}</p>
            </div>

            {result.mismatches.length === 0 ? (
              <div className="flex items-center gap-3 p-4 text-sm text-green-800">
                <ShieldCheck size={18} /> Tidak ada konflik material yang terdeteksi.
              </div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {result.mismatches.map((mismatch) => (
                  <button
                    key={mismatch.id}
                    onClick={() => chooseMismatch(mismatch)}
                    className={`w-full border-b border-[var(--border)] p-3 text-left last:border-0 hover:bg-[var(--muted)] ${selected?.id === mismatch.id ? "bg-[var(--muted)]" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{mismatch.type.replaceAll("_", " ")}</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${severityClass(mismatch.severity)}`}>{mismatch.severity}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--subtle)]">{mismatch.explanation}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selected && (
            <section className="mt-3 overflow-hidden rounded-lg border border-[var(--border)] bg-white">
              <div className="border-b border-[var(--border)] px-3 py-2.5">
                <h3 className="text-sm font-semibold">Perbandingan bukti</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-[var(--muted)] text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Dokumen</th>
                      <th className="px-3 py-2 font-medium">Nilai</th>
                      <th className="px-3 py-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.evidence.map((ev, index) => (
                      <tr key={`${ev.document_type}-${index}`} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2">{docLabels[ev.document_type]}</td>
                        <td className="max-w-56 break-words px-3 py-2 font-medium">{String(ev.value ?? "—")}</td>
                        <td className="px-3 py-2 mono">{Math.round(ev.confidence * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.estimated_discrepancy_value != null && (
                <div className="border-t border-[var(--border)] bg-amber-50 px-3 py-2 text-xs">
                  Estimasi nilai selisih: <strong>Rp {selected.estimated_discrepancy_value.toLocaleString("id-ID")}</strong>
                  {selected.estimate_price_source ? ` · harga dari ${docLabels[selected.estimate_price_source]}` : ""}
                </div>
              )}
              <details className="border-t border-[var(--border)]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-xs font-medium">
                  Provenance & detail teknis <CaretDown size={14} />
                </summary>
                <div className="space-y-2 px-3 pb-3 text-xs text-[var(--subtle)]">
                  {selected.evidence.map((ev, i) => (
                    <div key={i}>
                      <span className="font-medium text-[var(--text)]">{docLabels[ev.document_type]}</span>
                      {" · "}{ev.field} · {ev.evidence.length} region
                    </div>
                  ))}
                </div>
              </details>
            </section>
          )}

          {result.audit.final_decision && (
            <section className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">
              <div className="font-semibold">Override tercatat: {result.audit.final_decision}</div>
              <div className="mt-1">{result.audit.override_reason}</div>
              {result.audit.overridden_by && (
                <div className="mt-1 text-blue-800">Supervisor: {result.audit.overridden_by}</div>
              )}
              <div className="mt-1 text-blue-700">
                Keputusan sistem asli tetap: {result.audit.system_decision} · {result.audit.override_history.length} event audit
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="override-title" className="w-full max-w-md rounded-lg border border-[var(--border)] bg-white p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <WarningCircle className="mt-0.5 text-amber-700" size={20} />
          <div>
            <h2 id="override-title" className="font-semibold">Override keputusan sistem</h2>
            <p className="mt-1 text-xs text-[var(--subtle)]">Keputusan sistem asli akan tetap disimpan untuk audit.</p>
          </div>
        </div>
        <p className="mt-4 rounded-md bg-blue-50 p-3 text-xs text-blue-900">Identity override diambil dari akun supervisor yang sedang login dan dicatat otomatis.</p>
        <label className="mt-3 block text-xs font-medium">
          Keputusan akhir
          <select value={decision} onChange={(e) => setDecision(e.target.value as ReconciliationStatus)} className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-white px-2">
            <option value="CLEAR">CLEAR</option>
            <option value="REVIEW">REVIEW</option>
            <option value="HOLD">HOLD</option>
          </select>
        </label>
        <label className="mt-3 block text-xs font-medium">
          Alasan override
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Jelaskan verifikasi atau koreksi yang dilakukan…"
            className="mt-1 w-full resize-none rounded-md border border-[var(--border)] p-2"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={reason.trim().length < 5 || mutation.isPending}
          >
            {mutation.isPending ? "Menyimpan…" : "Simpan override"}
          </Button>
        </div>
      </div>
    </div>
  );
}
