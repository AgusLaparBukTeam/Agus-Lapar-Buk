"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OperationRegister } from "@/components/operations/operation-register";
import { fetchShipments, uploadDocument } from "@/lib/api";

export default function DocumentsPage() {
  const client = useQueryClient();
  const shipments = useQuery({
    queryKey: ["shipments", "document-upload"],
    queryFn: () => fetchShipments(new URLSearchParams("page_size=100")),
  });
  const [shipmentId, setShipmentId] = useState("");
  const [documentType, setDocumentType] = useState("COMMERCIAL_INVOICE");
  const [file, setFile] = useState<File | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (!shipmentId || !file) throw new Error("Choose a shipment and a file first.");
      return uploadDocument({ shipment_id: shipmentId, document_type: documentType, file });
    },
    onSuccess: () => {
      setFile(null);
      client.invalidateQueries({ queryKey: ["operations", "documents"] });
    },
  });

  return <div className="operations-page">
    <section className="data-panel document-upload-panel">
      <div className="data-panel__header"><div><h2>Add shipment evidence</h2><p>Upload the original file so the team can review its version, hash, and processing status.</p></div></div>
      <form className="document-upload-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <label>Shipment case<select value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} required><option value="">Choose a shipment</option>{shipments.data?.items.map((shipment) => <option value={shipment.id} key={shipment.id}>{shipment.internal_reference} · {shipment.origin} to {shipment.destination}</option>)}</select></label>
        <label>Evidence type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}><option value="COMMERCIAL_INVOICE">Commercial invoice</option><option value="PACKING_LIST">Packing list</option><option value="DELIVERY_ORDER">Delivery order</option><option value="CERTIFICATE_OF_ORIGIN">Certificate of origin</option></select></label>
        <label>File<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} required /></label>
        <div className="form-panel__actions"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Uploading…" : "Upload evidence"}</Button>{mutation.isSuccess && <span className="form-success" role="status">Evidence uploaded and queued for review.</span>}</div>
        {mutation.isError && <p className="form-error" role="alert">{(mutation.error as Error).message}</p>}
      </form>
    </section>
    <OperationRegister kind="documents" />
  </div>;
}
