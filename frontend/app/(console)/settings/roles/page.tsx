"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function RolesPage() {
  const { t } = useSettingsCopy();
  const permissions = [
    ["shipment.read", t.viewShipmentCases, true, true, true],
    ["shipment.create", t.createShipmentCases, true, true, true],
    ["document.upload", t.uploadEvidence, true, true, true],
    ["assessment.run", t.runAssuranceChecks, true, true, true],
    ["exception.resolve", t.resolveExceptions, false, true, true],
    ["release.hold", t.placeShipmentHold, false, true, true],
    ["release.authorize", t.authorizeRelease, false, true, true],
    ["release.second_approve", t.provideSecondApproval, false, true, true],
    ["audit.read", t.readActivityLog, false, true, true],
    ["people.manage", t.managePeoplePermission, false, false, true],
    ["workspace.manage", t.manageWorkspacePermission, false, false, true],
  ] as const;

  return (
    <div className="operations-page">
      <PageHeader icon={ShieldCheck} title={t.rolesPermissions} description={t.rolesPermissionsPageDescription} />
      <section className="data-panel data-panel--wide">
        <div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>{t.permission}</Table.Head><Table.Head>Operator</Table.Head><Table.Head>Reviewer</Table.Head><Table.Head>Administrator</Table.Head></Table.Row></Table.Header><Table.Body>{permissions.map(([key, label, operator, reviewer, admin]) => <Table.Row key={key}><Table.Cell><span className="table-cell-primary">{label}</span><small>{key}</small></Table.Cell><Table.Cell>{operator ? t.allowed : "—"}</Table.Cell><Table.Cell>{reviewer ? t.allowed : "—"}</Table.Cell><Table.Cell>{admin ? t.allowed : "—"}</Table.Cell></Table.Row>)}</Table.Body></Table></div>
      </section>
    </div>
  );
}
