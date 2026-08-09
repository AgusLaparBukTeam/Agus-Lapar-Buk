import type { AuditEvent, CurrentUser, DashboardSummary, HistoryResponse, MonitoringSummary, ReconciliationResult, ReconciliationStatus, ShipmentCase, ShipmentResponse, WorkQueueResponse } from "@/lib/types";

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
  data: { final_decision: ReconciliationStatus; reason: string },
): Promise<ReconciliationResult> {
  return parse(await fetch(`/api/reconciliations/${encodeURIComponent(sessionId)}/override`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...data, corrected_fields: {} }),
  }));
}

export async function fetchMe(): Promise<CurrentUser> {
  return parse(await fetch("/api/auth/me", { cache: "no-store" }));
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  return parse(await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
}

export async function logout(): Promise<void> { await parse(await fetch("/api/auth/logout", { method: "POST" })); }
export async function fetchHistory(params: URLSearchParams): Promise<HistoryResponse> { return parse(await fetch(`/api/reconciliations?${params.toString()}`, { cache: "no-store" })); }
export async function fetchReconciliation(id: string): Promise<ReconciliationResult> { return parse(await fetch(`/api/reconciliations/${encodeURIComponent(id)}`, { cache: "no-store" })); }
export async function fetchDashboard(): Promise<DashboardSummary> { return parse(await fetch("/api/dashboard/summary", { cache: "no-store" })); }
export async function fetchMonitoring(): Promise<MonitoringSummary> { return parse(await fetch("/api/monitoring", { cache: "no-store" })); }
export async function fetchAudit(): Promise<AuditEvent[]> { return parse(await fetch("/api/audit", { cache: "no-store" })); }
export async function fetchUsers(): Promise<CurrentUser[]> { return parse(await fetch("/api/users", { cache: "no-store" })); }
export async function createUser(payload: Record<string, string>): Promise<CurrentUser> { return parse(await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })); }
export async function updateUser(id: string, payload: Record<string, string | boolean>): Promise<CurrentUser> { return parse(await fetch(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })); }
export async function fetchShipments(params: URLSearchParams): Promise<ShipmentResponse> { return parse(await fetch(`/api/shipments?${params.toString()}`, { cache: "no-store" })); }
export async function createShipment(payload: Record<string, string | number | null>): Promise<ShipmentCase> { return parse(await fetch("/api/shipments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })); }
export async function fetchShipment(id: string): Promise<ShipmentCase> { return parse(await fetch(`/api/shipments/${encodeURIComponent(id)}`, { cache: "no-store" })); }
export async function fetchWorkQueue(params: URLSearchParams): Promise<WorkQueueResponse> { return parse(await fetch(`/api/work-queue?${params.toString()}`, { cache: "no-store" })); }
export async function updateWorkQueue(id: string, status: "IN_PROGRESS" | "RESOLVED"): Promise<void> { await parse(await fetch(`/api/work-queue/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })); }
export async function decideRelease(id: string, payload: { decision: "AUTHORIZE" | "HOLD"; reason: string }): Promise<{ shipment: ShipmentCase; decision: string; reason: string; decided_by: string; decided_at: string }> { return parse(await fetch(`/api/shipments/${encodeURIComponent(id)}/release-decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })); }
