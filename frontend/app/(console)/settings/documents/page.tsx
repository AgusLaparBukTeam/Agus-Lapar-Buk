"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";

export default function DocumentSettingsPage() {
  const [form, setForm] = useState({ require_invoice: true, require_packing_list: true, require_delivery_order: true, allow_replacement: true });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const values = data.settings as Record<string, unknown> | undefined; if (values?.documents) setForm((current) => ({ ...current, ...(values.documents as typeof current) })); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings({ documents: form }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <div className="operations-page"><PageHeader title="Document policy" description="Set the evidence your team expects before a shipment can move forward." /><form className="data-panel settings-check-list settings-form" onSubmit={save}><label><input type="checkbox" checked={form.require_invoice} onChange={(event) => setForm({ ...form, require_invoice: event.target.checked })} /> Require a commercial invoice</label><label><input type="checkbox" checked={form.require_packing_list} onChange={(event) => setForm({ ...form, require_packing_list: event.target.checked })} /> Require a packing list</label><label><input type="checkbox" checked={form.require_delivery_order} onChange={(event) => setForm({ ...form, require_delivery_order: event.target.checked })} /> Require a delivery order</label><label><input type="checkbox" checked={form.allow_replacement} onChange={(event) => setForm({ ...form, allow_replacement: event.target.checked })} /> Allow replacement versions with history</label><p className="muted-copy">Uploads remain bounded and every replacement keeps the previous version visible in the evidence record.</p><div className="form-panel__actions"><Button type="submit">Save document policy</Button>{saved && <span className="form-success" role="status">Policy saved</span>}</div></form></div>;
}
