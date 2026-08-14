"use client";


import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GearIcon as Gear, LockKeyIcon as LockKey, UsersThreeIcon as UsersThree } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function SettingsPage() {
  const { t } = useSettingsCopy();
  const result = useQuery({ queryKey: ["workspace-settings"], queryFn: fetchWorkspaceSettings });
  const organization = result.data?.organization as Record<string, unknown> | undefined;
  const categories = [
    ["/settings/general", t.general, t.generalDescription],
    ["/settings/review-policy", t.reviewPolicy, t.reviewPolicyDescription],
    ["/settings/documents", t.documentPolicy, t.documentPolicyDescription],
    ["/settings/notifications", t.notifications, t.notificationsDescription],
    ["/settings/retention", t.retention, t.retentionDescription],
    ["/settings/security", t.security, t.securityDescription],
  ] as const;

  return (
    <div className="operations-page">
      <PageHeader icon={Gear} title={t.workspaceSettings} description={t.workspaceSettingsDescription} />
      <div className="settings-overview-grid">
        <section className="data-panel" aria-labelledby="settings-configuration-title">
          <div className="data-panel__header"><div><h2 id="settings-configuration-title">{t.configuration}</h2><p>{t.configurationDescription}</p></div></div>
          <div className="settings-card-list">
            {categories.map(([href, title, description]) => (
              <Link className="settings-card" href={href} key={href}>
                <span className="settings-card__copy"><span className="settings-card__title">{title}</span><span className="settings-card__description">{description}</span></span>
                <span className="settings-card__chevron" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="settings-context-rail" aria-label={t.workspace}>
          <div className="context-rail__eyebrow">{t.workspace}</div>
          <h2>{String(organization?.name || "GateGuard Operations")}</h2>
          <dl>
            <div><dt>{t.code}</dt><dd>{String(organization?.code || "—")}</dd></div>
            <div><dt>{t.timezone}</dt><dd>{String(organization?.default_timezone || "UTC")}</dd></div>
            <div><dt>{t.currency}</dt><dd>{String(organization?.default_currency || "USD")}</dd></div>
            <div><dt>{t.protection}</dt><dd>{t.serverSideSessions}</dd></div>
          </dl>
          <div className="context-rail__links"><Link href="/settings/people"><UsersThree size={16} /> {t.peopleAndAccess}</Link><Link href="/settings/security"><LockKey size={16} /> {t.security}</Link></div>
        </aside>
      </div>
    </div>
  );
}
