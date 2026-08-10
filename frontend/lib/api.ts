import type { AuditEvent, CurrentUser, DashboardSummary, HistoryResponse, MonitoringSummary, ReconciliationResult, ReconciliationStatus, ShipmentCase, ShipmentResponse, WorkQueueResponse } from "@/lib/types";

async function ops<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (typeof window !== "undefined") {
    const organization = window.localStorage.getItem("gateguard.organization");
    if (organization) headers.set("X-GateGuard-Organization", organization);
  }
  return parse(await fetch(`/api/ops${path}`, { ...init, headers, cache: "no-store" }));
}

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
export async function changePassword(current_password: string, new_password: string): Promise<CurrentUser> { return parse(await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current_password, new_password }) })); }

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

export async function fetchOrganizations(): Promise<{ items: Array<Record<string, unknown>> }> { return ops("/organizations"); }
export async function fetchRecents(): Promise<{ items: Array<Record<string, unknown>> }> { return ops("/recents"); }
export async function recordRecent(payload: Record<string, string>): Promise<void> { await ops("/recents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function fetchGlobalSearch(query: string): Promise<{ items: Array<{ type: string; id: string; label: string; description: string; href: string }> }> { return ops(`/search?q=${encodeURIComponent(query)}`); }
export async function fetchWorkspaceShipment(id: string): Promise<Record<string, unknown>> { return ops(`/shipments/${encodeURIComponent(id)}/workspace`); }
export async function fetchOperationsList(path: string, params?: Record<string, string>): Promise<{ items: Array<Record<string, unknown>> }> {
  const query = new URLSearchParams(params);
  return ops(`${path}${query.size ? `?${query.toString()}` : ""}`);
}
export async function fetchAnalyticsSummary(days = 7): Promise<Record<string, unknown>> { return ops(`/analytics/summary?days=${days}`); }
export async function fetchAnalyticsTimeseries(days = 7): Promise<Record<string, unknown>> { return ops(`/analytics/timeseries?days=${days}`); }
export async function fetchObservability(): Promise<Record<string, unknown>> { return ops("/observability"); }
export async function fetchWorkspaceSettings(): Promise<Record<string, unknown>> { return ops("/settings/workspace"); }
export async function saveWorkspaceSettings(values: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/settings/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) }); }
export async function updateException(id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops(`/exceptions/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function addExceptionComment(id: string, body: string): Promise<Record<string, unknown>> { return ops(`/exceptions/${encodeURIComponent(id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }); }
export async function approveRelease(id: string, comment: string): Promise<Record<string, unknown>> { return ops(`/releases/${encodeURIComponent(id)}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) }); }
export async function transitionShipment(id: string, status: string): Promise<Record<string, unknown>> { return ops(`/shipments/${encodeURIComponent(id)}/lifecycle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); }
export async function createDocumentMetadata(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function uploadDocument(payload: { shipment_id: string; document_type: string; file: File; document_id?: string; requirement_id?: string }): Promise<Record<string, unknown>> {
  const form = new FormData();
  form.set("shipment_id", payload.shipment_id);
  form.set("document_type", payload.document_type);
  if (payload.document_id) form.set("document_id", payload.document_id);
  if (payload.requirement_id) form.set("requirement_id", payload.requirement_id);
  form.set("file", payload.file);
  return ops("/documents/upload", { method: "POST", body: form });
}
export async function fetchWebhooks(): Promise<{ items: Array<Record<string, unknown>> }> { return ops("/integrations/webhooks"); }
export async function createWebhook(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/integrations/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function createConnection(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/integrations/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function createServiceAccount(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/integrations/service-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function fetchNotifications(unreadOnly = false): Promise<{ unread: number; items: Array<Record<string, unknown>> }> { return ops(`/notifications${unreadOnly ? "?unread_only=true" : ""}`); }
export async function markNotificationRead(id: string): Promise<Record<string, unknown>> { return ops(`/notifications/${encodeURIComponent(id)}/read`, { method: "PATCH" }); }
export async function fetchReferenceData(params?: Record<string, string>): Promise<{ items: Array<Record<string, unknown>> }> { const query = new URLSearchParams(params); return ops(`/reference-data${query.size ? `?${query.toString()}` : ""}`); }
export async function createReferenceData(payload: Record<string, unknown>): Promise<Record<string, unknown>> { return ops("/reference-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); }
export async function fetchRulePack(id: string): Promise<{ rule_pack: Record<string, unknown>; rules: Array<Record<string, unknown>> }> { return ops(`/rule-packs/${encodeURIComponent(id)}`); }
export async function publishRulePack(id: string): Promise<Record<string, unknown>> { return ops(`/rule-packs/${encodeURIComponent(id)}/publish`, { method: "POST" }); }
export async function simulateRulePack(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> { return ops(`/rule-packs/${encodeURIComponent(id)}/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) }); }
