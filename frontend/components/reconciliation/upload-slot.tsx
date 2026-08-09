"use client";

import { File, FileArrowUp, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { validateFile } from "@/lib/validation";

export function UploadSlot({
  label,
  hint,
  file,
  onFile,
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (file: File | null, error: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(next: File | null) {
    if (!next) {
      setError(null);
      onFile(null, null);
      return;
    }
    const nextError = validateFile(next);
    setError(nextError);
    onFile(nextError ? null : next, nextError);
  }

  return (
    <section
      className={`min-h-40 rounded-lg border bg-white p-4 transition ${drag ? "border-[var(--accent)] ring-2 ring-blue-100" : "border-[var(--border)]"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        accept(e.dataTransfer.files[0] || null);
      }}
      aria-label={`Upload ${label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="mt-1 text-xs text-[var(--subtle)]">{hint}</p>
        </div>
        {file ? <File size={18} className="text-green-700" aria-hidden /> : <FileArrowUp size={18} className="text-[var(--subtle)]" aria-hidden />}
      </div>

      {file ? (
        <div className="mt-6 flex items-center justify-between gap-2 rounded-md bg-[var(--muted)] px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-xs text-[var(--subtle)]">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <Button variant="ghost" aria-label={`Hapus ${label}`} onClick={() => accept(null)}>
            <X size={16} />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-5 flex h-16 w-full items-center justify-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--subtle)] hover:bg-[var(--muted)]"
          onClick={() => inputRef.current?.click()}
        >
          Tarik file ke sini atau pilih file
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        onChange={(e) => accept(e.target.files?.[0] || null)}
      />
      {error && <p className="mt-2 text-xs text-red-700" role="alert">{error}</p>}
    </section>
  );
}
