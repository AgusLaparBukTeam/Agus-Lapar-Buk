"use client";

import { Gear, LockKey, UsersThree } from "@phosphor-icons/react";
import { ActionLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function SettingsPage() {
  return <div>
    <PageHeader icon={Gear} title="Workspace settings" description="Control how your team reviews shipments and manages access." />
    <div className="settings-layout">
      <aside className="settings-nav"><div className="settings-nav__title">Settings</div><a className="is-active" href="#workspace">Workspace</a><a href="#access">Access</a><a href="#review">Review rules</a></aside>
      <div className="settings-sections">
        <section className="settings-section" id="workspace"><div><h2>Workspace</h2><p>Basic information shown to your team while they work.</p></div><dl className="settings-values"><div><dt>Workspace name</dt><dd>GateGuard Operations</dd></div><div><dt>Default review language</dt><dd>English</dd></div></dl></section>
        <section className="settings-section" id="access"><div><h2>People and access</h2><p>Invite the people who prepare, review, and approve shipment decisions.</p></div><div className="settings-actions"><ActionLink href="/settings/users" icon={UsersThree}>Manage people</ActionLink></div></section>
        <section className="settings-section" id="review"><div><h2>Review policy</h2><p>GateGuard keeps the original check and any supervisor decision together so your team can trace what happened.</p></div><div className="settings-callout"><LockKey size={18} /><span>Access changes require an administrator. Security credentials are never shown here.</span></div></section>
      </div>
    </div>
  </div>;
}
