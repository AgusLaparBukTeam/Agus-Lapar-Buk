from __future__ import annotations

import json
from datetime import datetime, timezone
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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


class OverrideRequest(BaseModel):
    final_decision: ReconciliationStatus
    reason: str = Field(min_length=5, max_length=1000)
    actor: str = Field(min_length=2, max_length=120)
    corrected_fields: dict[str, Any] = Field(default_factory=dict)

    @field_validator("actor")
    @classmethod
    def clean_actor(cls, value: str) -> str:
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
