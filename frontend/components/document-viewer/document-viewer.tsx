"use client";

import { FileTextIcon as FileText, MagnifyingGlassMinusIcon as MagnifyingGlassMinus, MagnifyingGlassPlusIcon as MagnifyingGlassPlus } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentType, EvidenceRegion } from "@/lib/types";

const labels: Record<DocumentType, string> = {
  delivery_order: "Surat Jalan",
  invoice: "Invoice",
  packing_list: "Packing List",
};

export function DocumentViewer({
  files,
  selectedType,
  onType,
  evidence,
}: {
  files: Record<DocumentType, File>;
  selectedType: DocumentType;
  onType: (type: DocumentType) => void;
  evidence: EvidenceRegion[];
}) {
  const [zoom, setZoom] = useState(1);
  const url = useMemo(() => URL.createObjectURL(files[selectedType]), [files, selectedType]);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const file = files[selectedType];
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  return (
    <section className="flex min-h-[600px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-2">
        <div className="flex gap-1" role="tablist" aria-label="Dokumen">
          {(Object.keys(labels) as DocumentType[]).map((type) => (
            <Button
              key={type}
              type="button"
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={selectedType === type}
              onClick={() => onType(type)}
              className={`h-8 px-3 text-xs ${selectedType === type ? "bg-[var(--muted)] text-[var(--text)]" : "text-[var(--subtle)]"}`}
            >
              {labels[type]}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" aria-label="Perkecil" onClick={() => setZoom((z) => Math.max(.75, z - .25))}><MagnifyingGlassMinus size={15} /></Button>
          <span className="flex min-w-12 items-center justify-center text-xs text-[var(--subtle)]">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" aria-label="Perbesar" onClick={() => setZoom((z) => Math.min(2, z + .25))}><MagnifyingGlassPlus size={15} /></Button>
        </div>
      </div>
      <div className="relative flex-1 overflow-auto bg-neutral-100 p-3">
        {isPdf ? (
          <object
            aria-label={`Pratinjau ${labels[selectedType]}`}
            data={`${url}#toolbar=0&navpanes=0`}
            type="application/pdf"
            className="mx-auto h-full min-h-[540px] w-full bg-white"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          >
            <div className="p-6 text-center text-sm text-[var(--subtle)]">
              <FileText className="mx-auto mb-2" />
              Browser tidak dapat menampilkan PDF. Buka file secara lokal.
            </div>
          </object>
        ) : (
          <div className="relative mx-auto w-fit" style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Dokumen ${labels[selectedType]}`} className="max-h-[720px] max-w-full bg-white" />
            {evidence.map((box, i) => (
              <span
                key={`${box.page}-${i}`}
                aria-label={`Bukti: ${box.text || "wilayah dokumen"}`}
                className="absolute border-2 border-red-600 bg-red-500/10"
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
