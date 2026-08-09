export type DocumentType = "invoice" | "packing_list" | "delivery_order";
export type ReconciliationStatus = "CLEAR" | "REVIEW" | "HOLD";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type UserRole = "operator" | "supervisor" | "admin";

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

export interface EvidenceRegion {
  page: number; x: number; y: number; width: number; height: number; text?: string | null;
}
export interface DocumentField {
  value: string | number | null;
  raw_value?: string | null;
  confidence: number;
  evidence: EvidenceRegion[];
  source: string;
}
export interface ShipmentItem {
  sku: DocumentField;
  description: DocumentField;
  quantity: DocumentField;
  unit_price: DocumentField;
  line_total: DocumentField;
}
export interface ShipmentDocument {
  document_type: DocumentType;
  filename: string;
  detected_document_type?: DocumentType | null;
  document_type_confidence: number;
  line_items_complete: boolean;
  document_id: DocumentField;
  shipment_id: DocumentField;
  sender: DocumentField;
  recipient: DocumentField;
  destination: DocumentField;
  document_total: DocumentField;
  items: ShipmentItem[];
  extraction_provider: string;
}
export interface EvidenceValue {
  document_type: DocumentType;
  field: string;
  value: string | number | null;
  raw_value?: string | null;
  confidence: number;
  evidence: EvidenceRegion[];
}
export interface Mismatch {
  id: string;
  type: string;
  severity: Severity;
  field: string;
  explanation: string;
  evidence: EvidenceValue[];
  estimated_discrepancy_value?: number | null;
  estimate_price_source?: DocumentType | null;
}
export interface OverrideEvent {
  id: string;
  actor: string;
  previous_decision: ReconciliationStatus;
  final_decision: ReconciliationStatus;
  reason: string;
  corrected_fields: Record<string, unknown>;
  created_at: string;
}
export interface AuditState {
  system_decision: ReconciliationStatus;
  final_decision?: ReconciliationStatus | null;
  override_reason?: string | null;
  corrected_fields: Record<string, unknown>;
  overridden_at?: string | null;
  overridden_by?: string | null;
  override_history: OverrideEvent[];
}
export interface ReconciliationResult {
  session_id: string;
  created_at: string;
  status: ReconciliationStatus;
  effective_status: ReconciliationStatus;
  reason: string;
  recommended_action: string;
  documents: Record<DocumentType, ShipmentDocument>;
  mismatches: Mismatch[];
  audit: AuditState;
  processing_ms: number;
}

export interface HistoryResponse { items: ReconciliationResult[]; page: number; page_size: number; total: number; }
export interface DashboardSummary {
  date: string;
  reconciliations_today: number;
  clear_today: number;
  review_today: number;
  hold_today: number;
  awaiting_review: number;
  overridden: number;
  average_processing_ms: number;
  recent: ReconciliationResult[];
  readiness: Record<string, string>;
}
export interface AuditEvent {
  id: string;
  actor_user_id?: string | null;
  actor_display_name?: string | null;
  event_type: string;
  entity_type: string;
  entity_id?: string | null;
  metadata: Record<string, unknown>;
  request_id?: string | null;
  created_at: string;
}
export interface MonitoringSummary {
  application: string;
  database: string;
  environment: string;
  version: string;
  extraction_provider: string;
  provider_configured: boolean;
  limits: { max_upload_bytes: number; max_pdf_pages: number };
  volume: Record<string, unknown>;
}
