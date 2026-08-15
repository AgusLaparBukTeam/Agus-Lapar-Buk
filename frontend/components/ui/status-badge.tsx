import { Badge } from "@cloudflare/kumo/components/badge";
import type { ReconciliationStatus } from "@/lib/types";

const statusVariant = {
  CLEAR: "success",
  REVIEW: "warning",
  HOLD: "error",
} as const;

export function StatusBadge({ status }: { status: ReconciliationStatus }) {
  return <Badge variant={statusVariant[status]} appearance="dot">{status}</Badge>;
}
