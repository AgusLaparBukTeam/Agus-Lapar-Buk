"use client";

import { Gear, UsersThree } from "@phosphor-icons/react";
import { useState } from "react";
import { ActionLink, Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

const sections = [
  ["workspace", "Workspace"],
  ["access", "Access"],
  ["review", "Review rules"],
] as const;

export default function SettingsPage() {
  const [active, setActive] = useState<(typeof sections)[number][0]>("workspace");
  function jumpTo(id: (typeof sections)[number][0]) {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return <div><PageHeader icon={Gear} title="Workspace settings" description="Control how your team reviews shipments and manages access." /><div className="settings-layout"><aside className="settings-nav" aria-label="Settings sections"><div className="settings-nav__title">Settings</div>{sections.map(([id, label]) => <button type="button" key={id} className={active === id ? "is-active" : ""} onClick={() => jumpTo(id)}>{label}</button>)}</aside><div className="settings-sections"><section className="settings-section" id="workspace"><div><h2>Workspace</h2><p>Basic information shown to your team while they work.</p></div><dl className="settings-values"><div><dt>Workspace name</dt><dd>GateGuard Operations</dd></div><div><dt>Default review language</dt><dd>English</dd></div></dl></section><section className="settings-section" id="access"><div><h2>People and access</h2><p>Invite the people who prepare, review, and approve shipment decisions.</p></div><div className="settings-actions"><ActionLink href="/settings/users" icon={UsersThree}>Manage people</ActionLink></div></section><section className="settings-section" id="review"><div><h2>Review rules</h2><p>These safeguards keep a shipment decision tied to the checks and evidence that support it.</p></div><div className="settings-rule-list"><div><strong>Open checks before release</strong><span>Required · A shipment cannot be authorized while a check is unresolved.</span></div><div><strong>Supervisor decision record</strong><span>Required for holds, reviews, and any decision update.</span></div><Button variant="secondary" onClick={() => jumpTo("review")}>Review safeguards</Button></div></section></div></div></div>;
}
