"use client";

import { SpinnerGap } from "@phosphor-icons/react";
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
  const mutation = useMutation({ mutationFn: () => reconcile(files as Record<DocumentType, File>), onSuccess: (data) => setResult(data), onError: (error: Error) => toast.error(error.message) });
  function setFile(type: DocumentType, file: File | null, error: string | null) { setFiles((current) => ({ ...current, [type]: file })); setErrors((current) => ({ ...current, [type]: error || undefined })); }
  const ready = Object.values(files).every(Boolean) && !Object.values(errors).some(Boolean);
  if (result) return <ResultWorkspace initialResult={result} files={files as Record<DocumentType, File>} onReset={() => { setResult(null); setFiles(initialFiles); }} />;
  return <main className="document-check-page"><div className="document-check-intro"><h1>Check shipment documents</h1><p>Add the three required documents. GateGuard compares the information before release.</p></div><div className="grid gap-3 md:grid-cols-3"><UploadSlot label="Delivery order" hint="PDF, JPG, or PNG" file={files.delivery_order} onFile={(file, error) => setFile("delivery_order", file, error)} /><UploadSlot label="Invoice" hint="PDF, JPG, or PNG" file={files.invoice} onFile={(file, error) => setFile("invoice", file, error)} /><UploadSlot label="Packing list" hint="PDF, JPG, or PNG" file={files.packing_list} onFile={(file, error) => setFile("packing_list", file, error)} /></div><section className="mt-4 flex flex-col items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3 sm:flex-row sm:items-center"><div><div className="text-sm font-medium">{ready ? "Documents are ready" : "Add all three documents to continue"}</div><div className="mt-0.5 text-xs text-[var(--subtle)]">Upload → read → compare → review.</div></div><Button disabled={!ready || mutation.isPending} onClick={() => mutation.mutate()} className="min-w-44">{mutation.isPending ? <><SpinnerGap size={15} className="animate-spin" /> Checking documents…</> : "Check documents"}</Button></section>{mutation.isPending && <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900" role="status">We are reading and comparing the documents. The result will appear when the check is complete.</div>}</main>;
}
