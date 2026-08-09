export type DocumentType = "invoice" | "packing_list" | "delivery_order";
export type ReconciliationStatus = "CLEAR" | "REVIEW" | "HOLD";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

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
