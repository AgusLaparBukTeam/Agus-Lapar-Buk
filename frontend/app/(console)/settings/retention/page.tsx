"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";

export default function RetentionSettingsPage() {
  const [form, setForm] = useState({ audit_days: "365", document_days: "365", job_days: "90", webhook_days: "90" });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const values = data.settings as Record<string, unknown> | undefined; if (values?.retention) setForm((current) => ({ ...current, ...(values.retention as typeof current) })); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings({ retention: form }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <div className="operations-page"><PageHeader title="Retention" description="Set how long operational history remains available to your team." /><form className="form-panel settings-form" onSubmit={save}><div className="form-grid"><label>Activity history (days)<input type="number" min="30" value={form.audit_days} onChange={(event) => setForm({ ...form, audit_days: event.target.value })} /></label><label>Document metadata (days)<input type="number" min="30" value={form.document_days} onChange={(event) => setForm({ ...form, document_days: event.target.value })} /></label><label>Processing history (days)<input type="number" min="7" value={form.job_days} onChange={(event) => setForm({ ...form, job_days: event.target.value })} /></label><label>Delivery history (days)<input type="number" min="7" value={form.webhook_days} onChange={(event) => setForm({ ...form, webhook_days: event.target.value })} /></label></div><p className="muted-copy">Retention controls are policy records. A scheduled cleanup job should be enabled before deleting historical evidence.</p><div className="form-panel__actions"><Button type="submit">Save retention</Button>{saved && <span className="form-success" role="status">Retention saved</span>}</div></form></div>;
}
