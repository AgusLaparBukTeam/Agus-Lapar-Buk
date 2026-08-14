"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@cloudflare/kumo/components/input";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function RetentionSettingsPage() {
  const { t } = useSettingsCopy();
  const [form, setForm] = useState({ audit_days: "365", document_days: "365", job_days: "90", webhook_days: "90" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchWorkspaceSettings().then((data) => {
      const values = data.settings as Record<string, unknown> | undefined;
      if (values?.retention) setForm((current) => ({ ...current, ...(values.retention as typeof current) }));
    });
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saveWorkspaceSettings({ retention: form });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="operations-page">
      <PageHeader title={t.retention} description={t.retentionPageDescription} />
      <form className="form-panel settings-form" onSubmit={save}>
        <div className="form-grid">
          <Input label={t.activityHistoryDays} type="number" min="30" value={form.audit_days} onChange={(event) => setForm({ ...form, audit_days: event.target.value })} />
          <Input label={t.documentMetadataDays} type="number" min="30" value={form.document_days} onChange={(event) => setForm({ ...form, document_days: event.target.value })} />
          <Input label={t.processingHistoryDays} type="number" min="7" value={form.job_days} onChange={(event) => setForm({ ...form, job_days: event.target.value })} />
          <Input label={t.deliveryHistoryDays} type="number" min="7" value={form.webhook_days} onChange={(event) => setForm({ ...form, webhook_days: event.target.value })} />
        </div>
        <p className="muted-copy">{t.retentionHint}</p>
        <div className="form-panel__actions"><Button type="submit" variant="primary">{t.saveRetention}</Button>{saved && <span className="form-success" role="status">{t.retentionSaved}</span>}</div>
      </form>
    </div>
  );
}
