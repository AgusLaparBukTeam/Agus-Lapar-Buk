from __future__ import annotations

import json
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator


class DocumentType(StrEnum):
    INVOICE = "invoice"
    PACKING_LIST = "packing_list"
    DELIVERY_ORDER = "delivery_order"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ReconciliationStatus(StrEnum):
    CLEAR = "CLEAR"
    REVIEW = "REVIEW"
    HOLD = "HOLD"


class ShipmentStatus(StrEnum):
    DRAFT = "DRAFT"
    DOCUMENTS_REQUIRED = "DOCUMENTS_REQUIRED"
    READY_FOR_ASSESSMENT = "READY_FOR_ASSESSMENT"
    ASSESSING = "ASSESSING"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    HOLD = "HOLD"
    RELEASE_PENDING_APPROVAL = "RELEASE_PENDING_APPROVAL"
    RELEASE_AUTHORIZED = "RELEASE_AUTHORIZED"
    RELEASE_INVALIDATED = "RELEASE_INVALIDATED"
    DISPATCHED = "DISPATCHED"
    CLOSED = "CLOSED"


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class WorkQueueStatus(StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


class UserRole(StrEnum):
    OPERATOR = "operator"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"


class MismatchType(StrEnum):
    WRONG_RECIPIENT = "WRONG_RECIPIENT"
    WRONG_DESTINATION = "WRONG_DESTINATION"
    WRONG_SENDER = "WRONG_SENDER"
    WRONG_SKU = "WRONG_SKU"
    ITEM_DESCRIPTION_MISMATCH = "ITEM_DESCRIPTION_MISMATCH"
    WRONG_DOCUMENT_TYPE = "WRONG_DOCUMENT_TYPE"
    QUANTITY_MISMATCH = "QUANTITY_MISMATCH"
    MISSING_ITEM = "MISSING_ITEM"
    DUPLICATE_ITEM = "DUPLICATE_ITEM"
    DOCUMENT_ID_MISMATCH = "DOCUMENT_ID_MISMATCH"
    TOTAL_MISMATCH = "TOTAL_MISMATCH"
    LOW_CONFIDENCE_EXTRACTION = "LOW_CONFIDENCE_EXTRACTION"
    POSSIBLE_TEXT_VARIATION = "POSSIBLE_TEXT_VARIATION"


class EvidenceRegion(BaseModel):
    page: int = Field(default=1, ge=1)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(gt=0, le=1)
    height: float = Field(gt=0, le=1)
    text: str | None = Field(default=None, max_length=500)


class DocumentField(BaseModel):
    value: str | float | int | None = None
    raw_value: str | None = Field(default=None, max_length=2000)
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence: list[EvidenceRegion] = Field(default_factory=list)
    source: str = Field(default="unknown", max_length=120)


class ShipmentItem(BaseModel):
    sku: DocumentField
    description: DocumentField = Field(default_factory=DocumentField)
    quantity: DocumentField
    unit_price: DocumentField = Field(default_factory=DocumentField)
    line_total: DocumentField = Field(default_factory=DocumentField)


class ShipmentDocument(BaseModel):
    document_type: DocumentType
    filename: str = Field(max_length=120)
    detected_document_type: DocumentType | None = None
    document_type_confidence: float = Field(default=0.0, ge=0, le=1)
    line_items_complete: bool = False
    document_id: DocumentField = Field(default_factory=DocumentField)
    shipment_id: DocumentField = Field(default_factory=DocumentField)
    sender: DocumentField = Field(default_factory=DocumentField)
    recipient: DocumentField = Field(default_factory=DocumentField)
    destination: DocumentField = Field(default_factory=DocumentField)
    document_total: DocumentField = Field(default_factory=DocumentField)
    items: list[ShipmentItem] = Field(default_factory=list, max_length=10_000)
    extraction_provider: str = Field(default="unknown", max_length=120)
    preprocessing_applied: bool = False
    preprocessing_operations: list[str] = Field(default_factory=list, max_length=8)


class EvidenceValue(BaseModel):
    document_type: DocumentType
    field: str
    value: str | float | int | None
    raw_value: str | None = None
    confidence: float
    evidence: list[EvidenceRegion] = Field(default_factory=list)


class Mismatch(BaseModel):
    id: str
    type: MismatchType
    severity: Severity
    field: str
    explanation: str
    evidence: list[EvidenceValue] = Field(default_factory=list)
    estimated_discrepancy_value: float | None = None
    estimate_price_source: DocumentType | None = None


class OverrideEvent(BaseModel):
    id: str
    actor: str
    previous_decision: ReconciliationStatus
    final_decision: ReconciliationStatus
    reason: str
    corrected_fields: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AuditState(BaseModel):
    system_decision: ReconciliationStatus
    final_decision: ReconciliationStatus | None = None
    override_reason: str | None = None
    corrected_fields: dict[str, Any] = Field(default_factory=dict)
    overridden_at: datetime | None = None
    overridden_by: str | None = None
    override_history: list[OverrideEvent] = Field(default_factory=list)


class ReconciliationResult(BaseModel):
    session_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: ReconciliationStatus
    reason: str
    recommended_action: str
    documents: dict[DocumentType, ShipmentDocument]
    mismatches: list[Mismatch]
    audit: AuditState
    processing_ms: int = 0

    @computed_field
    @property
    def effective_status(self) -> ReconciliationStatus:
        """Operational decision after supervisor overrides; status remains the system decision."""
        return self.audit.final_decision or self.status

    @computed_field
    @property
    def estimated_discrepancy_total(self) -> float:
        """Total value of material discrepancies with a usable price basis."""
        return round(
            sum(
                mismatch.estimated_discrepancy_value or 0.0
                for mismatch in self.mismatches
                if mismatch.estimated_discrepancy_value is not None
            ),
            2,
        )


class OverrideRequest(BaseModel):
    final_decision: ReconciliationStatus
    reason: str = Field(min_length=5, max_length=1000)
    actor: str | None = Field(default=None, min_length=2, max_length=120)
    corrected_fields: dict[str, Any] = Field(default_factory=dict)

    @field_validator("actor")
    @classmethod
    def clean_actor(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Supervisor identity is required")
        return cleaned

    @model_validator(mode="after")
    def no_silent_or_oversized_override(self):
        if not self.reason.strip():
            raise ValueError("Override reason is required")
        encoded = json.dumps(self.corrected_fields, ensure_ascii=False, default=str).encode("utf-8")
        if len(encoded) > 16 * 1024:
            raise ValueError("corrected_fields exceeds the 16 KB audit limit")
        return self


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    role: UserRole
    active: bool
    created_at: datetime
    updated_at: datetime
    last_login_at: datetime | None = None
    must_change_password: bool = False


class UserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    display_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=1, max_length=256)
    role: UserRole


class UserUpdateRequest(BaseModel):
    role: UserRole | None = None
    active: bool | None = None


class ShipmentCreateRequest(BaseModel):
    internal_reference: str = Field(min_length=2, max_length=120)
    external_reference: str | None = Field(default=None, max_length=120)
    origin: str = Field(min_length=2, max_length=160)
    destination: str = Field(min_length=2, max_length=160)
    transport_mode: str = Field(default="Road", min_length=2, max_length=40)
    expected_recipient: str | None = Field(default=None, max_length=160)
    expected_currency: str | None = Field(default=None, max_length=8)
    expected_total: float | None = Field(default=None, ge=0)

    @field_validator(
        "internal_reference",
        "external_reference",
        "origin",
        "destination",
        "transport_mode",
        "expected_recipient",
        "expected_currency",
    )
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return " ".join(value.strip().split()) if value else value


class ShipmentResponse(BaseModel):
    id: str
    internal_reference: str
    external_reference: str | None = None
    origin: str
    destination: str
    transport_mode: str
    status: ShipmentStatus
    risk_level: RiskLevel
    assigned_to: str | None = None
    assigned_display_name: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    trusted_reference: dict[str, Any] | None = None
    open_tasks: int = 0


class PaginatedShipments(BaseModel):
    items: list[ShipmentResponse]
    page: int
    page_size: int
    total: int


class WorkQueueItem(BaseModel):
    id: str
    shipment_id: str
    shipment_reference: str
    issue: str
    priority: RiskLevel
    stage: str
    status: WorkQueueStatus
    assignee: str | None = None
    due_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class WorkQueueUpdateRequest(BaseModel):
    status: WorkQueueStatus


class PaginatedWorkQueue(BaseModel):
    items: list[WorkQueueItem]
    page: int
    page_size: int
    total: int


class ReleaseDecisionRequest(BaseModel):
    decision: str = Field(pattern="^(AUTHORIZE|HOLD)$")
    reason: str = Field(min_length=5, max_length=1000)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return " ".join(value.strip().split())


class ReleaseDecisionResponse(BaseModel):
    shipment: ShipmentResponse
    decision: str
    reason: str
    decided_by: str
    decided_at: datetime


class PaginatedReconciliations(BaseModel):
    items: list[ReconciliationResult]
    page: int
    page_size: int
    total: int


class DashboardSummary(BaseModel):
    date: str
    reconciliations_today: int
    clear_today: int
    review_today: int
    hold_today: int
    awaiting_review: int
    overridden: int
    average_processing_ms: float
    total_discrepancy_prevented: float = 0.0
    recent: list[ReconciliationResult]
    readiness: dict[str, str]


class AuditEventResponse(BaseModel):
    id: str
    actor_user_id: str | None
    actor_service_account_id: str | None
    actor_type: str
    actor_id: str | None
    actor_display_name: str | None
    event_type: str
    entity_type: str
    entity_id: str | None
    metadata: dict[str, Any]
    request_id: str | None
    created_at: datetime
