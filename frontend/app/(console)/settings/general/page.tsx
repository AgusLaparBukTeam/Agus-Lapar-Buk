"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { Input } from "@cloudflare/kumo/components/input";
import { fetchWorkspaceSettings, saveWorkspaceSettings } from "@/lib/api";

export default function GeneralSettingsPage() {
  const [form, setForm] = useState({ name: "", default_timezone: "UTC", default_locale: "en-GB", default_currency: "USD" });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetchWorkspaceSettings().then((data) => { const organization = data.organization as Record<string, unknown> | undefined; if (organization) setForm({ name: String(organization.name || ""), default_timezone: String(organization.default_timezone || "UTC"), default_locale: String(organization.default_locale || "en-GB"), default_currency: String(organization.default_currency || "USD") }); }); }, []);
  async function save(event: React.FormEvent) { event.preventDefault(); await saveWorkspaceSettings(form); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  return <div className="operations-page"><PageHeader title="General" description="Set the workspace details your team sees while working on shipment cases." /><form className="form-panel settings-form" onSubmit={save}><div className="form-grid"><Input label="Workspace name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><label>Timezone<AppSelect ariaLabel="Timezone" value={form.default_timezone} onValueChange={(default_timezone) => setForm({ ...form, default_timezone })} options={[{ value: "UTC", label: "UTC" }, { value: "Asia/Jakarta", label: "Asia/Jakarta" }, { value: "Europe/London", label: "Europe/London" }, { value: "America/New_York", label: "America/New_York" }]} /></label><label>Locale<AppSelect ariaLabel="Locale" value={form.default_locale} onValueChange={(default_locale) => setForm({ ...form, default_locale })} options={[{ value: "en-GB", label: "English (United Kingdom)" }, { value: "id-ID", label: "Bahasa Indonesia" }]} /></label><Input label="Currency" maxLength={8} value={form.default_currency} onChange={(event) => setForm({ ...form, default_currency: event.target.value.toUpperCase() })} /></div><div className="form-panel__actions"><Button type="submit" variant="primary">Save changes</Button>{saved && <span className="form-success" role="status">Saved</span>}</div></form></div>;
}
