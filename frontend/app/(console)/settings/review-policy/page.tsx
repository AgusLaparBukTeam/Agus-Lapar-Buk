"use client";


import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@cloudflare/kumo/components/input";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function ReviewPolicyPage() {
  const { t } = useSettingsCopy();
  const [form, setForm] = useState({ low_sla_hours: "24", medium_sla_hours: "8", high_sla_hours: "4", critical_sla_hours: "1", require_decision_reason: true, require_high_risk_approval: true, require_critical_exception_approval: true });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchWorkspaceSettings().then((data) => {
      const values = data.settings as Record<string, unknown> | undefined;
      if (values?.review_policy) setForm((current) => ({ ...current, ...(values.review_policy as typeof current) }));
    });
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saveWorkspaceSettings({ review_policy: form });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="operations-page">
      <PageHeader title={t.reviewPolicy} description={t.reviewPolicyPageDescription} />
      <form className="form-panel settings-form" onSubmit={save}>
        <div className="form-grid">
          <Input label={t.lowPrioritySla} type="number" min="1" value={form.low_sla_hours} onChange={(event) => setForm({ ...form, low_sla_hours: event.target.value })} />
          <Input label={t.mediumPrioritySla} type="number" min="1" value={form.medium_sla_hours} onChange={(event) => setForm({ ...form, medium_sla_hours: event.target.value })} />
          <Input label={t.highPrioritySla} type="number" min="1" value={form.high_sla_hours} onChange={(event) => setForm({ ...form, high_sla_hours: event.target.value })} />
          <Input label={t.criticalPrioritySla} type="number" min="1" value={form.critical_sla_hours} onChange={(event) => setForm({ ...form, critical_sla_hours: event.target.value })} />
        </div>
        <div className="settings-check-list">
          <Checkbox label={t.requireDecisionReason} checked={form.require_decision_reason} onCheckedChange={(checked) => setForm({ ...form, require_decision_reason: Boolean(checked) })} />
          <Checkbox label={t.requireHighRiskApproval} checked={form.require_high_risk_approval} onCheckedChange={(checked) => setForm({ ...form, require_high_risk_approval: Boolean(checked) })} />
          <Checkbox label={t.requireCriticalExceptionApproval} checked={form.require_critical_exception_approval} onCheckedChange={(checked) => setForm({ ...form, require_critical_exception_approval: Boolean(checked) })} />
        </div>
        <div className="form-panel__actions"><Button type="submit" variant="primary">{t.savePolicy}</Button>{saved && <span className="form-success" role="status">{t.policySaved}</span>}</div>
      </form>
    </div>
  );
}
