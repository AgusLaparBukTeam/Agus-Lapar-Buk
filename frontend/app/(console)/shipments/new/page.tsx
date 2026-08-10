"use client";

import { ArrowLeftIcon as ArrowLeft, PackageIcon as Package } from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { createShipment } from "@/lib/api";

export default function NewShipmentPage() {
  const router = useRouter();
  const [form, setForm] = useState({ internal_reference: "", external_reference: "", origin: "", destination: "", transport_mode: "Road", expected_recipient: "", expected_currency: "", expected_total: "" });
  const mutation = useMutation({ mutationFn: () => createShipment({ ...form, expected_total: form.expected_total ? Number(form.expected_total) : null }), onSuccess: (shipment) => router.push(`/shipments/${shipment.id}`) });
  const update = (field: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  return <div>
    <Link className="back-link" href="/shipments"><ArrowLeft size={15} /> Back to shipments</Link>
    <PageHeader icon={Package} title="Create shipment" description="Start a case before documents arrive so every check and decision stays connected." />
    <form className="form-panel" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}><div className="form-panel__heading"><div><h2>Shipment details</h2><p>Use the reference your team will recognize during handover.</p></div></div><div className="form-grid"><label>Shipment reference<input required value={form.internal_reference} onChange={update("internal_reference")} placeholder="e.g. SHP-2026-001" /></label><label>Order reference <span className="field-optional">optional</span><input value={form.external_reference} onChange={update("external_reference")} placeholder="e.g. PO-4821" /></label><label>Origin<input required value={form.origin} onChange={update("origin")} placeholder="Warehouse or city" /></label><label>Destination<input required value={form.destination} onChange={update("destination")} placeholder="Customer or delivery location" /></label><label>Transport mode<select value={form.transport_mode} onChange={update("transport_mode")}><option>Road</option><option>Sea</option><option>Air</option><option>Rail</option></select></label><label>Expected recipient <span className="field-optional">optional</span><input value={form.expected_recipient} onChange={update("expected_recipient")} placeholder="Name on the delivery order" /></label><label>Currency <span className="field-optional">optional</span><input value={form.expected_currency} onChange={update("expected_currency")} placeholder="IDR" maxLength={8} /></label><label>Expected total <span className="field-optional">optional</span><input type="number" min="0" value={form.expected_total} onChange={update("expected_total")} placeholder="0" /></label></div>{mutation.isError && <p role="alert" className="form-error">{(mutation.error as Error).message}</p>}<div className="form-panel__actions"><Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Creating…" : "Create shipment"}</Button></div></form>
  </div>;
}
