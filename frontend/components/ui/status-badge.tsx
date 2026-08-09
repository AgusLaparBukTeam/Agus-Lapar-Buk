import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import type { ReconciliationStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const Icon = status === "CLEAR" ? CheckCircle2 : status === "REVIEW" ? AlertTriangle : OctagonAlert;
  const styles = status === "CLEAR"
    ? "border-green-200 bg-green-50 text-green-800"
    : status === "REVIEW"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-red-200 bg-red-50 text-red-800";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${styles}`}>
      <Icon size={14} aria-hidden="true" /> {status}
    </span>
  );
}
