import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

const accessAreas = [
  ["/settings/people", "People", "Add or deactivate workspace members and assign their responsibility."],
  ["/settings/roles", "Roles and permissions", "See what operators, reviewers, and administrators can do."],
  ["/settings/security", "Security", "Review sign-in, session, and workspace access protections."],
] as const;

export default function AccessSettingsPage() {
  return <div className="operations-page"><PageHeader title="Access" description="Keep the right people involved in preparing, reviewing, and approving shipment cases." /><div className="settings-overview-grid"><section className="data-panel"><div className="data-panel__header"><div><h2>Access controls</h2><p>Choose a workspace access area to continue.</p></div></div><div className="settings-card-list">{accessAreas.map(([href, title, description]) => <Link className="settings-card" href={href} key={href}><div><strong>{title}</strong><span>{description}</span></div><span aria-hidden="true">›</span></Link>)}</div></section><aside className="settings-context-rail"><div className="context-rail__eyebrow">Responsibility</div><h2>Clear ownership</h2><p className="muted-copy">Operators prepare evidence. Reviewers resolve findings and approve decisions. Administrators control workspace access.</p></aside></div></div>;
}
