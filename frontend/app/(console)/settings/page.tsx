"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GearIcon as Gear, LockKeyIcon as LockKey, UsersThreeIcon as UsersThree } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings } from "@/lib/api";

const categories = [
  ["/settings/general", "General", "Workspace name, locale, timezone, and currency."],
  ["/settings/review-policy", "Review policy", "SLA and release approval rules."],
  ["/settings/documents", "Documents", "Allowed evidence and retention policy."],
  ["/settings/notifications", "Notifications", "Workspace alerts and personal preferences."],
  ["/settings/retention", "Retention", "Audit, document, job, and webhook history."],
  ["/settings/security", "Security", "Sessions, password policy, and API access."],
] as const;

export default function SettingsPage() {
  const result = useQuery({ queryKey: ["workspace-settings"], queryFn: fetchWorkspaceSettings });
  const organization = result.data?.organization as Record<string, unknown> | undefined;
  return <div className="operations-page"><PageHeader icon={Gear} title="Workspace settings" description="Configure how this organization prepares, reviews, and releases shipment cases." /><div className="settings-overview-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Configuration</h2><p>Each category saves a real workspace setting and records an audit event.</p></div></div><div className="settings-card-list">{categories.map(([href, title, description]) => <Link className="settings-card" href={href} key={href}><div><strong>{title}</strong><span>{description}</span></div><span aria-hidden="true">›</span></Link>)}</div></section><aside className="settings-context-rail"><div className="context-rail__eyebrow">Workspace</div><h2>{String(organization?.name || "GateGuard Operations")}</h2><dl><div><dt>Code</dt><dd>{String(organization?.code || "—")}</dd></div><div><dt>Timezone</dt><dd>{String(organization?.default_timezone || "UTC")}</dd></div><div><dt>Currency</dt><dd>{String(organization?.default_currency || "USD")}</dd></div><div><dt>Security posture</dt><dd>Server-side sessions</dd></div></dl><div className="context-rail__links"><Link href="/settings/people"><UsersThree size={16} /> People and access</Link><Link href="/settings/security"><LockKey size={16} /> Security</Link></div></aside></div></div>;
}
