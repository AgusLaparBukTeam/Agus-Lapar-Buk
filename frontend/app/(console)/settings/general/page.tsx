"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";

export default function GeneralSettingsPage() {
  const [form, setForm] = useState({ name: "", default_timezone: "UTC", default_locale: "en-GB", default_currency: "USD" });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const organization = data.organization as Record<string, unknown> | undefined; if (organization) setForm({ name: String(organization.name || ""), default_timezone: String(organization.default_timezone || "UTC"), default_locale: String(organization.default_locale || "en-GB"), default_currency: String(organization.default_currency || "USD") }); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings(form); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <div className="operations-page"><PageHeader title="General" description="Set the workspace details your team sees while working on shipment cases." /><form className="form-panel settings-form" onSubmit={save}><div className="form-grid"><label>Workspace name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Timezone<select value={form.default_timezone} onChange={(event) => setForm({ ...form, default_timezone: event.target.value })}><option>UTC</option><option>Asia/Jakarta</option><option>Europe/London</option><option>America/New_York</option></select></label><label>Locale<select value={form.default_locale} onChange={(event) => setForm({ ...form, default_locale: event.target.value })}><option>en-GB</option><option>id-ID</option></select></label><label>Currency<input maxLength={8} value={form.default_currency} onChange={(event) => setForm({ ...form, default_currency: event.target.value.toUpperCase() })} /></label></div><div className="form-panel__actions"><Button type="submit">Save changes</Button>{saved && <span className="form-success" role="status">Saved</span>}</div></form></div>;
}
