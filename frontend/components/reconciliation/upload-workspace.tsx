"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResultWorkspace } from "@/components/reconciliation/result-workspace";
import { UploadSlot } from "@/components/reconciliation/upload-slot";
import { reconcile } from "@/lib/api";
import type { DocumentType, ReconciliationResult } from "@/lib/types";

type Files = Record<DocumentType, File | null>;
const initialFiles: Files = { delivery_order: null, invoice: null, packing_list: null };

export function UploadWorkspace() {
  const [files, setFiles] = useState<Files>(initialFiles);
  const [errors, setErrors] = useState<Partial<Record<DocumentType, string>>>({});
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => reconcile(files as Record<DocumentType, File>),
    onSuccess: (data) => setResult(data),
    onError: (error: Error) => toast.error(error.message),
  });

  function setFile(type: DocumentType, file: File | null, error: string | null) {
    setFiles((current) => ({ ...current, [type]: file }));
    setErrors((current) => ({ ...current, [type]: error || undefined }));
  }

  const ready = Object.values(files).every(Boolean) && !Object.values(errors).some(Boolean);

  if (result) {
    return (
      <ResultWorkspace
        initialResult={result}
        files={files as Record<DocumentType, File>}
        onReset={() => { setResult(null); setFiles(initialFiles); }}
      />
    );
  }

  return (
    <>
      <header className="h-[52px] border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-white"><ShieldCheck size={16} /></span>
            GateGuard
          </div>
          <div className="text-xs text-[var(--subtle)]">Pre-dispatch assurance</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 lg:p-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Rekonsiliasi dokumen pengiriman</h1>
          <p className="mt-1 text-sm text-[var(--subtle)]">Unggah tiga dokumen wajib. Sistem akan membandingkan bukti terstruktur sebelum dispatch.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <UploadSlot label="Surat Jalan" hint="Delivery Order · PDF/JPG/PNG" file={files.delivery_order} onFile={(f, e) => setFile("delivery_order", f, e)} />
          <UploadSlot label="Invoice" hint="Invoice · PDF/JPG/PNG" file={files.invoice} onFile={(f, e) => setFile("invoice", f, e)} />
          <UploadSlot label="Packing List" hint="Packing List · PDF/JPG/PNG" file={files.packing_list} onFile={(f, e) => setFile("packing_list", f, e)} />
        </div>

        <section className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3 sm:flex-row sm:items-center">
          <div>
            <div className="text-sm font-medium">{ready ? "Dokumen siap diproses" : "Lengkapi tiga dokumen untuk melanjutkan"}</div>
            <div className="mt-0.5 text-xs text-[var(--subtle)]">Validasi file → ekstraksi → normalisasi → pemeriksaan konsistensi.</div>
          </div>
          <Button disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()} className="min-w-44">
            {mutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Memproses dokumen…</> : "Periksa dokumen"}
          </Button>
        </section>

        {mutation.isPending && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900" role="status">
            Ekstraksi dan pemeriksaan konsistensi sedang berjalan. Hasil akan tampil setelah seluruh pemeriksaan selesai.
          </div>
        )}
      </main>
    </>
  );
}
