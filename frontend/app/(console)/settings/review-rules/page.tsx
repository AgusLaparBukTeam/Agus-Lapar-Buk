"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { fetchWorkspaceSettings } from "@/lib/api";

export default function ReviewRulesPage() {
  const result = useQuery({ queryKey: ["workspace-settings"], queryFn: fetchWorkspaceSettings });
  const policy = (result.data?.settings as Record<string, unknown> | undefined)?.review_policy as Record<string, unknown> | undefined;
  const requireSecondApproval = policy?.require_high_risk_approval !== false;
  const requireReason = policy?.require_decision_reason !== false;
  return <div className="operations-page"><PageHeader title="Review rules" description="Understand which findings pause a shipment and when another person must approve a release." actions={<Link href="/settings/review-policy"><Button>Open review policy</Button></Link>} /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Current review rules</h2><p>These rules reflect the saved workspace policy.</p></div></div><div className="gate-list"><div><span>Required evidence is missing</span><strong className="gate-state gate-state--review">Needs review</strong></div><div><span>Dangerous-goods details are incomplete</span><strong className="gate-state gate-state--review">Hold</strong></div><div><span>High or critical risk release</span><strong className={`gate-state gate-state--${requireSecondApproval ? "review" : "clear"}`}>{requireSecondApproval ? "Second approval" : "Reviewer decision"}</strong></div><div><span>Release decision without a reason</span><strong className={`gate-state gate-state--${requireReason ? "review" : "clear"}`}>{requireReason ? "Not allowed" : "Allowed"}</strong></div></div>{result.isError && <p className="form-error" role="alert">The saved review policy could not be loaded.</p>}</section></div>;
}
