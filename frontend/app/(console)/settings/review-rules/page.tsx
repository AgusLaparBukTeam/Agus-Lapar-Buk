"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { fetchWorkspaceSettings } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function ReviewRulesPage() {
  const { t } = useSettingsCopy();
  const result = useQuery({ queryKey: ["workspace-settings"], queryFn: fetchWorkspaceSettings });
  const policy = (result.data?.settings as Record<string, unknown> | undefined)?.review_policy as Record<string, unknown> | undefined;
  const requireSecondApproval = policy?.require_high_risk_approval !== false;
  const requireReason = policy?.require_decision_reason !== false;

  return (
    <div className="operations-page">
      <PageHeader title={t.reviewRules} description={t.reviewRulesPageDescription} actions={<Link href="/settings/review-policy"><Button>{t.openReviewPolicy}</Button></Link>} />
      <section className="data-panel data-panel--wide" aria-labelledby="current-review-rules-title">
        <div className="data-panel__header"><div><h2 id="current-review-rules-title">{t.currentReviewRules}</h2><p>{t.currentReviewRulesHint}</p></div></div>
        <div className="gate-list">
          <div><span>{t.requiredEvidenceMissing}</span><span className="gate-state gate-state--review">{t.needsReview}</span></div>
          <div><span>{t.dangerousGoodsIncomplete}</span><span className="gate-state gate-state--review">{t.hold}</span></div>
          <div><span>{t.highOrCriticalRelease}</span><span className={`gate-state gate-state--${requireSecondApproval ? "review" : "clear"}`}>{requireSecondApproval ? t.secondApproval : t.reviewerDecision}</span></div>
          <div><span>{t.decisionWithoutReason}</span><span className={`gate-state gate-state--${requireReason ? "review" : "clear"}`}>{requireReason ? t.notAllowed : t.allowed}</span></div>
        </div>
        {result.isError && <p className="form-error" role="alert">{t.reviewPolicyLoadError}</p>}
      </section>
    </div>
  );
}
