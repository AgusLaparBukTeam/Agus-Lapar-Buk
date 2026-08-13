"use client";

import { FileIcon as File, FileArrowUpIcon as FileArrowUp, XIcon as X } from "@phosphor-icons/react";
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
      className={`min-h-40 rounded-md border bg-kumo-base p-4 ${drag ? "border-kumo-focus ring-2 ring-kumo-focus/20" : "border-kumo-line"}`}
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
          <h2 className="text-sm font-semibold text-kumo-contrast">{label}</h2>
          <p className="mt-1 text-sm text-kumo-neutral-750">{hint}</p>
        </div>
        {file ? <File size={18} className="text-kumo-success" aria-hidden /> : <FileArrowUp size={18} className="text-kumo-neutral-750" aria-hidden />}
      </div>

      {file ? (
        <div className="mt-6 flex items-center justify-between gap-2 rounded-md bg-kumo-recessed px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{file.name}</div>
            <div className="text-sm text-kumo-neutral-750">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
          <Button variant="ghost" aria-label={`Remove ${label}`} onClick={() => accept(null)}>
            <X size={16} />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-5 h-16 w-full border border-dashed border-kumo-line text-sm text-kumo-neutral-750"
          onClick={() => inputRef.current?.click()}
        >
          Drop a file here or choose one
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        onChange={(e) => accept(e.target.files?.[0] || null)}
      />
      {error && <p className="mt-2 text-sm text-kumo-danger" role="alert">{error}</p>}
    </section>
  );
}
