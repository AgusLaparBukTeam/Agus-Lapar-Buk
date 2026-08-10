import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

export default function ReviewRulesPage() {
  return <div className="operations-page"><PageHeader title="Review rules" description="Understand which findings pause a shipment and when another person must approve a release." actions={<Link href="/settings/review-policy"><Button>Open review policy</Button></Link>} /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Current review rules</h2><p>Rules are applied to every shipment case in this workspace.</p></div></div><div className="gate-list"><div><span>Required evidence is missing</span><strong className="gate-state gate-state--review">Needs review</strong></div><div><span>Dangerous-goods details are incomplete</span><strong className="gate-state gate-state--review">Hold</strong></div><div><span>High or critical risk release</span><strong className="gate-state gate-state--review">Second approval</strong></div><div><span>Release decision without a reason</span><strong className="gate-state gate-state--review">Not allowed</strong></div></div></section></div>;
}
