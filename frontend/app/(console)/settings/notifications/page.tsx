"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";

const options = [["task_assigned", "Task assigned"], ["critical_exception", "Critical exception"], ["task_overdue", "Task overdue"], ["evidence_requested", "Evidence requested"], ["release_invalidated", "Release needs review"]] as const;
export default function NotificationSettingsPage() {
  const [form, setForm] = useState<Record<string, boolean>>(() => Object.fromEntries(options.map(([key]) => [key, true])));
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const savedValues = (data.settings as Record<string, unknown> | undefined)?.notifications; if (savedValues && typeof savedValues === "object") setForm((current) => ({ ...current, ...(savedValues as Record<string, boolean>) })); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings({ notifications: form }); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <div className="operations-page"><PageHeader title="Notifications" description="Choose which operational events should reach your team." /><form className="data-panel settings-check-list settings-form" onSubmit={save}>{options.map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} /> {label}</label>)}<p className="muted-copy">These preferences are stored with the workspace and can be refined per person later.</p><div className="form-panel__actions"><Button type="submit">Save notifications</Button>{saved && <span className="form-success" role="status">Notifications saved</span>}</div></form></div>;
}
