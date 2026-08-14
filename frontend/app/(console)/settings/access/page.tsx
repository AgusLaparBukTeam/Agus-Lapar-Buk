"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function AccessSettingsPage() {
  const { t } = useSettingsCopy();
  const accessAreas = [
    ["/settings/people", t.peopleAndAccess, t.peopleAccessDescription],
    ["/settings/roles", t.rolesPermissions, t.rolesAccessDescription],
    ["/settings/security", t.security, t.securityAccessDescription],
  ] as const;

  return (
    <div className="operations-page">
      <PageHeader title={t.access} description={t.accessPageDescription} />
      <div className="settings-overview-grid">
        <section className="data-panel" aria-labelledby="access-controls-title">
          <div className="data-panel__header"><div><h2 id="access-controls-title">{t.accessControls}</h2><p>{t.accessControlsHint}</p></div></div>
          <div className="settings-card-list">{accessAreas.map(([href, title, description]) => <Link className="settings-card" href={href} key={href}><span className="settings-card__copy"><span className="settings-card__title">{title}</span><span className="settings-card__description">{description}</span></span><span className="settings-card__chevron" aria-hidden="true">›</span></Link>)}</div>
        </section>
        <aside className="settings-context-rail" aria-label={t.responsibility}><div className="context-rail__eyebrow">{t.responsibility}</div><h2>{t.clearOwnership}</h2><p className="muted-copy">{t.ownershipHint}</p></aside>
      </div>
    </div>
  );
}
