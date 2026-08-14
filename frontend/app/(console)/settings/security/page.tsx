"use client";

import { PageHeader } from "@/components/ui/page-header";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function SecuritySettingsPage() {
  const { t } = useSettingsCopy();
  return (
    <div className="operations-page">
      <PageHeader title={t.security} description={t.securityPageDescription} />
      <div className="dashboard-grid">
        <section className="data-panel" aria-labelledby="security-authentication-title">
          <h2 id="security-authentication-title">{t.authentication}</h2>
          <dl className="definition-list">
            <div><dt>{t.sessions}</dt><dd>{t.opaqueServerSessions}</dd></div>
            <div><dt>{t.passwords}</dt><dd>{t.argonHashed}</dd></div>
            <div><dt>{t.secureCookie}</dt><dd>{t.readOnlyDeploymentSetting}</dd></div>
          </dl>
        </section>
        <section className="data-panel" aria-labelledby="security-access-title">
          <h2 id="security-access-title">{t.access}</h2>
          <dl className="definition-list">
            <div><dt>{t.organizationScoping}</dt><dd>{t.membershipCheckedServerSide}</dd></div>
            <div><dt>{t.apiAccess}</dt><dd>{t.serviceAccountsAndTokens}</dd></div>
            <div><dt>{t.securityEvents}</dt><dd>{t.recordedInActivityLog}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}
