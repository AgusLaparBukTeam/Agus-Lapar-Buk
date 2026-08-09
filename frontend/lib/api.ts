import type { ReconciliationResult, ReconciliationStatus } from "@/lib/types";

async function parse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export async function reconcile(files: Record<string, File>): Promise<ReconciliationResult> {
  const form = new FormData();
  form.set("delivery_order", files.delivery_order);
  form.set("invoice", files.invoice);
  form.set("packing_list", files.packing_list);
  return parse(await fetch("/api/reconcile", {
    method: "POST",
    body: form,
  }));
}

export async function overrideDecision(
  sessionId: string,
  data: { final_decision: ReconciliationStatus; reason: string; actor: string },
  supervisorKey: string,
): Promise<ReconciliationResult> {
  return parse(await fetch(`/api/reconciliations/${encodeURIComponent(sessionId)}/override`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(supervisorKey ? { "X-Supervisor-Key": supervisorKey } : {}),
    },
    body: JSON.stringify({ ...data, corrected_fields: {} }),
  }));
}
