"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

const optionKeys = ["task_assigned", "critical_exception", "task_overdue", "evidence_requested", "release_invalidated"] as const;

export default function NotificationSettingsPage() {
  const { t } = useSettingsCopy();
  const labels = {
    task_assigned: t.taskAssigned,
    critical_exception: t.criticalException,
    task_overdue: t.taskOverdue,
    evidence_requested: t.evidenceRequested,
    release_invalidated: t.releaseNeedsReview,
  };
  const [form, setForm] = useState<Record<string, boolean>>(() => Object.fromEntries(optionKeys.map((key) => [key, true])));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchWorkspaceSettings().then((data) => {
      const savedValues = (data.settings as Record<string, unknown> | undefined)?.notifications;
      if (savedValues && typeof savedValues === "object") setForm((current) => ({ ...current, ...(savedValues as Record<string, boolean>) }));
    });
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    await saveWorkspaceSettings({ notifications: form });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="operations-page">
      <PageHeader title={t.notifications} description={t.notificationsPageDescription} />
      <form className="data-panel settings-check-list settings-form" onSubmit={save}>
        {optionKeys.map((key) => <Checkbox key={key} label={labels[key]} checked={Boolean(form[key])} onCheckedChange={(checked) => setForm({ ...form, [key]: Boolean(checked) })} />)}
        <p className="muted-copy">{t.notificationPreferencesHint}</p>
        <div className="form-panel__actions"><Button type="submit" variant="primary">{t.saveNotifications}</Button>{saved && <span className="form-success" role="status">{t.notificationsSaved}</span>}</div>
      </form>
    </div>
  );
}
