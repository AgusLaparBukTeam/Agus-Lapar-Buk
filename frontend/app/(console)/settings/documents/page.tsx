"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function DocumentSettingsPage() {
  const { t } = useSettingsCopy();
  const [form, setForm] = useState({ require_invoice: true, require_packing_list: true, require_delivery_order: true, allow_replacement: true });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const values = data.settings as Record<string, unknown> | undefined; if (values?.documents) setForm((current) => ({ ...current, ...(values.documents as typeof current) })); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings({ documents: form }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }

  return (
    <div className="operations-page">
      <PageHeader title={t.documentPolicy} description={t.documentPageDescription} />
      <form className="data-panel settings-check-list settings-form" onSubmit={save}>
        <Checkbox label={t.requireCommercialInvoice} checked={form.require_invoice} onCheckedChange={(checked) => setForm({ ...form, require_invoice: Boolean(checked) })} />
        <Checkbox label={t.requirePackingList} checked={form.require_packing_list} onCheckedChange={(checked) => setForm({ ...form, require_packing_list: Boolean(checked) })} />
        <Checkbox label={t.requireDeliveryOrder} checked={form.require_delivery_order} onCheckedChange={(checked) => setForm({ ...form, require_delivery_order: Boolean(checked) })} />
        <Checkbox label={t.allowReplacementHistory} checked={form.allow_replacement} onCheckedChange={(checked) => setForm({ ...form, allow_replacement: Boolean(checked) })} />
        <p className="muted-copy">{t.documentPolicyHint}</p>
        <div className="form-panel__actions"><Button type="submit" variant="primary">{t.saveDocumentPolicy}</Button>{saved && <span className="form-success" role="status">{t.policySaved}</span>}</div>
      </form>
    </div>
  );
}
