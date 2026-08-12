import { CheckCircleIcon as CheckCircle, WarningIcon as Warning, WarningOctagonIcon as WarningOctagon } from "@phosphor-icons/react";
import type { ReconciliationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const Icon = status === "CLEAR" ? CheckCircle : status === "REVIEW" ? Warning : WarningOctagon;
  const styles = status === "CLEAR"
    ? "border-kumo-success bg-kumo-success-tint text-kumo-success"
    : status === "REVIEW"
      ? "border-kumo-warning bg-kumo-warning-tint text-kumo-warning"
      : "border-kumo-danger bg-kumo-danger-tint text-kumo-danger";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-medium ${styles}`}>
      <Icon size={14} aria-hidden="true" /> {status}
    </span>
  );
}
