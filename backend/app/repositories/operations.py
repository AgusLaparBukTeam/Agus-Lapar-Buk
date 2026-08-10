from __future__ import annotations

import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    or_,
    select,
)
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.errors import GateGuardError, NotFoundError
from app.domain.models import ShipmentStatus, UserRole
from app.repositories.reconciliations import (
    Base,
    ReleaseDecisionRow,
    ReviewTaskRow,
    ShipmentCaseRow,
    UserRow,
)


def now_utc() -> datetime:
    return datetime.now(UTC)


class OrganizationRow(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    default_timezone: Mapped[str] = mapped_column(String(80), default="UTC")
    default_locale: Mapped[str] = mapped_column(String(16), default="en-GB")
    default_currency: Mapped[str] = mapped_column(String(8), default="USD")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FacilityRow(Base):
    __tablename__ = "facilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    code: Mapped[str] = mapped_column(String(40))
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    location: Mapped[str | None] = mapped_column(String(240), nullable=True)
    timezone: Mapped[str] = mapped_column(String(80), default="UTC")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WorkspaceMembershipRow(Base):
    __tablename__ = "workspace_memberships"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(24))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RecentObjectRow(Base):
    __tablename__ = "recent_objects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    object_type: Mapped[str] = mapped_column(String(40), index=True)
    object_id: Mapped[str] = mapped_column(String(36), index=True)
    label: Mapped[str] = mapped_column(String(240))
    href: Mapped[str] = mapped_column(String(320))
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class TradePartyRow(Base):
    __tablename__ = "trade_parties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    legal_name: Mapped[str] = mapped_column(String(200), index=True)
    trade_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tax_identifier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_identifier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShipmentPartyRow(Base):
    __tablename__ = "shipment_parties"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trade_parties.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PartyIdentifierRow(Base):
    __tablename__ = "party_identifiers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trade_parties.id", ondelete="CASCADE"), index=True
    )
    identifier_type: Mapped[str] = mapped_column(String(40))
    identifier_value: Mapped[str] = mapped_column(String(160))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShipmentItemRow(Base):
    __tablename__ = "shipment_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer)
    sku: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    description: Mapped[str] = mapped_column(String(400))
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit_of_measure: Mapped[str] = mapped_column(String(24), default="unit")
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    line_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    country_of_origin: Mapped[str | None] = mapped_column(String(2), nullable=True)
    hs_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    gross_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    net_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    dangerous_goods: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    un_number: Mapped[str | None] = mapped_column(String(16), nullable=True)
    proper_shipping_name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    hazard_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    packing_group: Mapped[str | None] = mapped_column(String(16), nullable=True)
    special_handling: Mapped[str | None] = mapped_column(Text, nullable=True)
    package_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TransportLegRow(Base):
    __tablename__ = "transport_legs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    sequence: Mapped[int] = mapped_column(Integer)
    mode: Mapped[str] = mapped_column(String(24))
    carrier: Mapped[str | None] = mapped_column(String(160), nullable=True)
    origin: Mapped[str | None] = mapped_column(String(160), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(160), nullable=True)
    planned_departure: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    planned_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_departure: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    vessel: Mapped[str | None] = mapped_column(String(120), nullable=True)
    voyage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    flight: Mapped[str | None] = mapped_column(String(80), nullable=True)
    vehicle_reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TransportEquipmentRow(Base):
    __tablename__ = "transport_equipment"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    equipment_type: Mapped[str] = mapped_column(String(24))
    equipment_identifier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    seal_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ShipmentDocumentRow(Base):
    __tablename__ = "shipment_documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    document_type: Mapped[str] = mapped_column(String(48), index=True)
    requirement_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DocumentVersionRow(Base):
    __tablename__ = "document_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    document_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_documents.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    filename: Mapped[str] = mapped_column(String(240))
    mime_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    uploaded_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    storage_key: Mapped[str] = mapped_column(String(320))
    extraction_status: Mapped[str] = mapped_column(String(24), index=True)
    extraction_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    extraction_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    supersedes_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class DocumentRequirementRow(Base):
    __tablename__ = "document_requirements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    rule_pack_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    document_type: Mapped[str] = mapped_column(String(48))
    status: Mapped[str] = mapped_column(String(24))
    condition_json: Mapped[str] = mapped_column(Text, default="{}")
    reason: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RequirementEvaluationRow(Base):
    __tablename__ = "requirement_evaluations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    requirement_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("document_requirements.id", ondelete="CASCADE"), index=True
    )
    rule_pack_version: Mapped[str] = mapped_column(String(40))
    result: Mapped[str] = mapped_column(String(24), index=True)
    reason: Mapped[str] = mapped_column(Text)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AssuranceCheckRow(Base):
    __tablename__ = "assurance_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    check_type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    summary: Mapped[str] = mapped_column(String(240))
    details_json: Mapped[str] = mapped_column(Text, default="{}")
    source: Mapped[str] = mapped_column(String(120))
    source_version: Mapped[str] = mapped_column(String(40), default="1")
    rule_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rule_pack_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ShipmentExceptionRow(Base):
    __tablename__ = "shipment_exceptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    assurance_check_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("assurance_checks.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(64), index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    summary: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text)
    assigned_to: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    resolution_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExceptionCommentRow(Base):
    __tablename__ = "exception_comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    exception_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_exceptions.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class DecisionApprovalRow(Base):
    __tablename__ = "decision_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    release_decision_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("release_decisions.id", ondelete="CASCADE"), index=True
    )
    approver_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    approval_type: Mapped[str] = mapped_column(String(48))
    comment: Mapped[str] = mapped_column(Text)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class RulePackRow(Base):
    __tablename__ = "rule_packs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), index=True)
    scope: Mapped[str] = mapped_column(String(80))
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    published_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RuleDefinitionRow(Base):
    __tablename__ = "rule_definitions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    rule_pack_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("rule_packs.id", ondelete="CASCADE"), index=True
    )
    rule_id: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    condition_json: Mapped[str] = mapped_column(Text, default="{}")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class IntegrationConnectionRow(Base):
    __tablename__ = "integration_connections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24), index=True)
    configuration_safe_json: Mapped[str] = mapped_column(Text, default="{}")
    credential_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ServiceAccountRow(Base):
    __tablename__ = "service_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ApiTokenRow(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    service_account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("service_accounts.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    prefix: Mapped[str] = mapped_column(String(16))
    scopes: Mapped[str] = mapped_column(Text, default="[]")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WebhookSubscriptionRow(Base):
    __tablename__ = "webhook_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(160))
    endpoint: Mapped[str] = mapped_column(String(500))
    events_json: Mapped[str] = mapped_column(Text, default="[]")
    secret_hash: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WebhookDeliveryRow(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    subscription_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    response_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(240), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ProcessingJobRow(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="SET NULL"), nullable=True, index=True
    )
    job_type: Mapped[str] = mapped_column(String(48), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    priority: Mapped[int] = mapped_column(Integer, default=50, index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    safe_error: Mapped[str | None] = mapped_column(String(500), nullable=True)


class NotificationRow(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500))
    href: Mapped[str | None] = mapped_column(String(320), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class NotificationPreferenceRow(Base):
    __tablename__ = "notification_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class WorkspaceSettingRow(Base):
    __tablename__ = "workspace_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    setting_key: Mapped[str] = mapped_column(String(100), index=True)
    value_json: Mapped[str] = mapped_column(Text)
    updated_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScreeningRunRow(Base):
    __tablename__ = "screening_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    party_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trade_parties.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(80))
    dataset: Mapped[str] = mapped_column(String(120))
    dataset_version: Mapped[str] = mapped_column(String(40))
    screened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    result: Mapped[str] = mapped_column(String(32), index=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    matched_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    matched_identifier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    disposition: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DomainEventRow(Base):
    __tablename__ = "domain_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    payload_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


def row_dict(row: Any, *, exclude: set[str] | None = None) -> dict[str, Any]:
    exclude = exclude or set()
    return {
        column.name: getattr(row, column.name)
        for column in row.__table__.columns
        if column.name not in exclude
    }


class OperationsRepository:
    def __init__(self, database_url: str, *, auto_create_schema: bool = True):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        connect_args = (
            {"check_same_thread": False, "timeout": 10} if database_url.startswith("sqlite") else {}
        )
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)
        if auto_create_schema:
            Base.metadata.create_all(self.engine)
        self.ensure_default_workspace()

    def ensure_default_workspace(self) -> str:
        with self.session_factory() as session:
            organization = session.scalar(
                select(OrganizationRow).order_by(OrganizationRow.created_at.asc())
            )
            now = now_utc()
            if organization is None:
                organization = OrganizationRow(
                    id=str(uuid.uuid4()),
                    name="GateGuard Operations",
                    code="DEFAULT",
                    created_at=now,
                    updated_at=now,
                )
                session.add(organization)
                session.flush()
                session.add(
                    FacilityRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization.id,
                        name="Primary facility",
                        code="PRIMARY",
                        country_code=None,
                        location=None,
                        timezone=organization.default_timezone,
                        created_at=now,
                        updated_at=now,
                    )
                )
            users = list(session.scalars(select(UserRow)))
            for user in users:
                exists = session.scalar(
                    select(WorkspaceMembershipRow).where(
                        WorkspaceMembershipRow.organization_id == organization.id,
                        WorkspaceMembershipRow.user_id == user.id,
                    )
                )
                if exists is None:
                    session.add(
                        WorkspaceMembershipRow(
                            id=str(uuid.uuid4()),
                            organization_id=organization.id,
                            user_id=user.id,
                            role=user.role,
                            active=True,
                            created_at=now,
                        )
                    )
            if (
                not session.scalar(
                    select(RulePackRow).where(RulePackRow.name == "DEMO_BASELINE_RULE_PACK")
                )
                and users
            ):
                author = users[0]
                pack = RulePackRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization.id,
                    name="DEMO_BASELINE_RULE_PACK",
                    version="1.0",
                    status="PUBLISHED",
                    scope="Workspace",
                    effective_from=now,
                    created_by=author.id,
                    published_by=author.id,
                    published_at=now,
                    created_at=now,
                    updated_at=now,
                )
                session.add(pack)
                session.flush()
                for name, doc_type, reason in (
                    (
                        "Commercial invoice",
                        "COMMERCIAL_INVOICE",
                        "Baseline commercial value evidence.",
                    ),
                    ("Packing list", "PACKING_LIST", "Baseline item and package evidence."),
                    (
                        "Delivery order",
                        "DELIVERY_ORDER",
                        "Baseline handover and destination evidence.",
                    ),
                ):
                    session.add(
                        RuleDefinitionRow(
                            id=str(uuid.uuid4()),
                            rule_pack_id=pack.id,
                            rule_id=f"BASE-{doc_type}",
                            name=name,
                            description=reason,
                            condition_json="{}",
                            active=True,
                            created_at=now,
                        )
                    )
            session.commit()
            return organization.id

    def organization_for(self, user: UserRow, requested_id: str | None = None) -> OrganizationRow:
        with self.session_factory() as session:
            stmt = (
                select(OrganizationRow)
                .join(
                    WorkspaceMembershipRow,
                    WorkspaceMembershipRow.organization_id == OrganizationRow.id,
                )
                .where(
                    WorkspaceMembershipRow.user_id == user.id,
                    WorkspaceMembershipRow.active.is_(True),
                    OrganizationRow.active.is_(True),
                )
            )
            if requested_id:
                stmt = stmt.where(OrganizationRow.id == requested_id)
            organization = session.scalar(stmt.order_by(OrganizationRow.created_at.asc()))
            if organization is None:
                raise GateGuardError(
                    "You do not have access to this workspace.", code="FORBIDDEN", status_code=403
                )
            return organization

    def list_organizations(self, user: UserRow) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            rows = list(
                session.scalars(
                    select(OrganizationRow)
                    .join(
                        WorkspaceMembershipRow,
                        WorkspaceMembershipRow.organization_id == OrganizationRow.id,
                    )
                    .where(
                        WorkspaceMembershipRow.user_id == user.id,
                        WorkspaceMembershipRow.active.is_(True),
                        OrganizationRow.active.is_(True),
                    )
                    .order_by(OrganizationRow.name.asc())
                )
            )
            return [row_dict(row) for row in rows]

    def record_recent(
        self,
        *,
        organization_id: str,
        user_id: str,
        object_type: str,
        object_id: str,
        label: str,
        href: str,
    ) -> None:
        with self.session_factory() as session:
            old = session.scalar(
                select(RecentObjectRow).where(
                    RecentObjectRow.organization_id == organization_id,
                    RecentObjectRow.user_id == user_id,
                    RecentObjectRow.object_type == object_type,
                    RecentObjectRow.object_id == object_id,
                )
            )
            if old:
                old.viewed_at = now_utc()
            else:
                session.add(
                    RecentObjectRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        user_id=user_id,
                        object_type=object_type,
                        object_id=object_id,
                        label=label,
                        href=href,
                        viewed_at=now_utc(),
                    )
                )
            session.commit()

    def recents(
        self, *, organization_id: str, user_id: str, limit: int = 25
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            rows = list(
                session.scalars(
                    select(RecentObjectRow)
                    .where(
                        RecentObjectRow.organization_id == organization_id,
                        RecentObjectRow.user_id == user_id,
                    )
                    .order_by(RecentObjectRow.viewed_at.desc())
                    .limit(max(1, min(limit, 100)))
                )
            )
            return [row_dict(row) for row in rows]

    def search(
        self, *, organization_id: str, user: UserRow, query: str, limit: int = 20
    ) -> list[dict[str, Any]]:
        term = f"%{query.strip()}%"
        bounded = max(1, min(limit, 50))
        result: list[dict[str, Any]] = []
        with self.session_factory() as session:
            shipments = list(
                session.scalars(
                    select(ShipmentCaseRow)
                    .where(
                        ShipmentCaseRow.organization_id == organization_id,
                        or_(
                            ShipmentCaseRow.internal_reference.like(term),
                            ShipmentCaseRow.external_reference.like(term),
                            ShipmentCaseRow.destination.like(term),
                        ),
                    )
                    .order_by(ShipmentCaseRow.updated_at.desc())
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "shipment",
                    "id": row.id,
                    "label": row.internal_reference,
                    "description": f"{row.origin} → {row.destination}",
                    "href": f"/shipments/{row.id}",
                }
                for row in shipments
            )
            documents = list(
                session.execute(
                    select(ShipmentDocumentRow, ShipmentCaseRow)
                    .join(ShipmentCaseRow, ShipmentCaseRow.id == ShipmentDocumentRow.shipment_id)
                    .where(
                        ShipmentDocumentRow.organization_id == organization_id,
                        ShipmentDocumentRow.document_type.like(term),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "document",
                    "id": doc.id,
                    "label": doc.document_type,
                    "description": shipment.internal_reference,
                    "href": "/documents",
                }
                for doc, shipment in documents
            )
            parties = list(
                session.scalars(
                    select(TradePartyRow)
                    .where(
                        TradePartyRow.organization_id == organization_id,
                        TradePartyRow.legal_name.like(term),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "party",
                    "id": party.id,
                    "label": party.legal_name,
                    "description": party.country_code or "Party",
                    "href": "/parties",
                }
                for party in parties
            )
            items = list(
                session.scalars(
                    select(ShipmentItemRow)
                    .where(
                        ShipmentItemRow.organization_id == organization_id,
                        or_(ShipmentItemRow.sku.like(term), ShipmentItemRow.description.like(term)),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "product",
                    "id": item.id,
                    "label": item.sku or item.description,
                    "description": "Shipment item",
                    "href": "/products",
                }
                for item in items
            )
            exceptions = list(
                session.scalars(
                    select(ShipmentExceptionRow)
                    .where(
                        ShipmentExceptionRow.organization_id == organization_id,
                        ShipmentExceptionRow.summary.like(term),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "exception",
                    "id": item.id,
                    "label": item.summary,
                    "description": item.status,
                    "href": "/exceptions",
                }
                for item in exceptions
            )
            releases = list(
                session.execute(
                    select(ReleaseDecisionRow, ShipmentCaseRow)
                    .join(ShipmentCaseRow, ShipmentCaseRow.id == ReleaseDecisionRow.shipment_id)
                    .where(
                        ShipmentCaseRow.organization_id == organization_id,
                        ReleaseDecisionRow.reason.like(term),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "release",
                    "id": release.id,
                    "label": shipment.internal_reference,
                    "description": release.decision,
                    "href": "/releases",
                }
                for release, shipment in releases
            )
            if user.role in {UserRole.ADMIN.value, UserRole.SUPERVISOR.value}:
                users = list(
                    session.scalars(
                        select(UserRow)
                        .join(WorkspaceMembershipRow, WorkspaceMembershipRow.user_id == UserRow.id)
                        .where(
                            WorkspaceMembershipRow.organization_id == organization_id,
                            or_(UserRow.display_name.like(term), UserRow.email.like(term)),
                        )
                        .limit(bounded)
                    )
                )
                result.extend(
                    {
                        "type": "person",
                        "id": item.id,
                        "label": item.display_name,
                        "description": item.email,
                        "href": "/settings/people",
                    }
                    for item in users
                )
        return result[:bounded]

    def list_parties(
        self, *, organization_id: str, query: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = select(TradePartyRow).where(TradePartyRow.organization_id == organization_id)
            if query:
                term = f"%{query.strip()}%"
                stmt = stmt.where(
                    or_(
                        TradePartyRow.legal_name.like(term),
                        TradePartyRow.external_identifier.like(term),
                    )
                )
            rows = list(
                session.scalars(
                    stmt.order_by(TradePartyRow.updated_at.desc()).limit(max(1, min(limit, 200)))
                )
            )
            output = []
            for row in rows:
                shipment_count = (
                    session.scalar(
                        select(func.count(ShipmentPartyRow.id)).where(
                            ShipmentPartyRow.party_id == row.id
                        )
                    )
                    or 0
                )
                output.append(
                    {
                        **row_dict(row),
                        "shipment_count": int(shipment_count),
                        "screening": "Not configured",
                    }
                )
            return output

    def list_items(
        self, *, organization_id: str, query: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = (
                select(ShipmentItemRow, ShipmentCaseRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ShipmentItemRow.shipment_id)
                .where(ShipmentItemRow.organization_id == organization_id)
            )
            if query:
                term = f"%{query.strip()}%"
                stmt = stmt.where(
                    or_(
                        ShipmentItemRow.sku.like(term),
                        ShipmentItemRow.description.like(term),
                        ShipmentCaseRow.internal_reference.like(term),
                    )
                )
            rows = list(
                session.execute(
                    stmt.order_by(ShipmentItemRow.updated_at.desc()).limit(max(1, min(limit, 200)))
                )
            )
            return [
                {**row_dict(item), "shipment_reference": shipment.internal_reference}
                for item, shipment in rows
            ]

    def list_transport(
        self, *, organization_id: str, shipment_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = select(TransportLegRow).where(TransportLegRow.organization_id == organization_id)
            if shipment_id:
                stmt = stmt.where(TransportLegRow.shipment_id == shipment_id)
            return [
                row_dict(row)
                for row in session.scalars(stmt.order_by(TransportLegRow.sequence.asc()))
            ]

    def list_documents(
        self,
        *,
        organization_id: str,
        query: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = (
                select(ShipmentDocumentRow, ShipmentCaseRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ShipmentDocumentRow.shipment_id)
                .where(ShipmentDocumentRow.organization_id == organization_id)
            )
            if query:
                term = f"%{query.strip()}%"
                stmt = stmt.where(
                    or_(
                        ShipmentDocumentRow.document_type.like(term),
                        ShipmentCaseRow.internal_reference.like(term),
                    )
                )
            if status:
                stmt = stmt.where(ShipmentDocumentRow.status == status)
            rows = list(
                session.execute(
                    stmt.order_by(ShipmentDocumentRow.updated_at.desc()).limit(
                        max(1, min(limit, 200))
                    )
                )
            )
            output = []
            for document, shipment in rows:
                version = (
                    session.scalar(
                        select(DocumentVersionRow).where(
                            DocumentVersionRow.id == document.current_version_id
                        )
                    )
                    if document.current_version_id
                    else None
                )
                output.append(
                    {
                        **row_dict(document),
                        "shipment_reference": shipment.internal_reference,
                        "version": row_dict(version) if version else None,
                    }
                )
            return output

    def detail(self, *, organization_id: str, shipment_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            parties = list(
                session.execute(
                    select(ShipmentPartyRow, TradePartyRow)
                    .join(TradePartyRow, TradePartyRow.id == ShipmentPartyRow.party_id)
                    .where(ShipmentPartyRow.shipment_id == shipment_id)
                )
            )
            documents = self.list_documents(organization_id=organization_id)
            docs = [item for item in documents if item["shipment_id"] == shipment_id]
            items = [
                row_dict(row)
                for row in session.scalars(
                    select(ShipmentItemRow)
                    .where(ShipmentItemRow.shipment_id == shipment_id)
                    .order_by(ShipmentItemRow.line_number.asc())
                )
            ]
            legs = [
                row_dict(row)
                for row in session.scalars(
                    select(TransportLegRow)
                    .where(TransportLegRow.shipment_id == shipment_id)
                    .order_by(TransportLegRow.sequence.asc())
                )
            ]
            checks = [
                row_dict(row) | {"details": json.loads(row.details_json)}
                for row in session.scalars(
                    select(AssuranceCheckRow)
                    .where(AssuranceCheckRow.shipment_id == shipment_id)
                    .order_by(AssuranceCheckRow.created_at.desc())
                )
            ]
            exceptions = [
                row_dict(row)
                for row in session.scalars(
                    select(ShipmentExceptionRow)
                    .where(ShipmentExceptionRow.shipment_id == shipment_id)
                    .order_by(ShipmentExceptionRow.created_at.desc())
                )
            ]
            open_tasks = (
                session.scalar(
                    select(func.count(ReviewTaskRow.id)).where(
                        ReviewTaskRow.shipment_id == shipment_id,
                        ReviewTaskRow.status != "RESOLVED",
                    )
                )
                or 0
            )
            return {
                "shipment": row_dict(shipment) | {"open_tasks": int(open_tasks)},
                "parties": [
                    {**row_dict(link), "party": row_dict(party)} for link, party in parties
                ],
                "documents": docs,
                "items": items,
                "transport": legs,
                "checks": checks,
                "exceptions": exceptions,
                "release_gate": self.release_gate(session, shipment_id),
                "risk_factors": json.loads(shipment.risk_factors_json or "[]"),
            }

    def release_gate(self, session: Session, shipment_id: str) -> list[dict[str, Any]]:
        documents = (
            session.scalar(
                select(func.count(ShipmentDocumentRow.id)).where(
                    ShipmentDocumentRow.shipment_id == shipment_id,
                    ShipmentDocumentRow.status.in_(["READY", "NEEDS_REVIEW"]),
                )
            )
            or 0
        )
        checks = list(
            session.scalars(
                select(AssuranceCheckRow)
                .where(AssuranceCheckRow.shipment_id == shipment_id)
                .order_by(AssuranceCheckRow.created_at.desc())
            )
        )
        latest: dict[str, AssuranceCheckRow] = {}
        for check in checks:
            latest.setdefault(check.check_type, check)
        exceptions = (
            session.scalar(
                select(func.count(ShipmentExceptionRow.id)).where(
                    ShipmentExceptionRow.shipment_id == shipment_id,
                    ShipmentExceptionRow.status.not_in(["RESOLVED", "CANCELLED"]),
                )
            )
            or 0
        )

        def state(condition: bool, review: bool = False) -> str:
            return "CLEAR" if condition else "REVIEW" if review else "BLOCKED"

        return [
            {"key": "documents", "label": "Required documents", "state": state(documents > 0)},
            {
                "key": "reconciliation",
                "label": "Document reconciliation",
                "state": latest.get("DOCUMENT_RECONCILIATION").status
                if latest.get("DOCUMENT_RECONCILIATION")
                else "REVIEW",
            },
            {
                "key": "trusted_source",
                "label": "Trusted source",
                "state": latest.get("TRUSTED_REFERENCE").status
                if latest.get("TRUSTED_REFERENCE")
                else "REVIEW",
            },
            {
                "key": "screening",
                "label": "Party screening",
                "state": latest.get("PARTY_SCREENING").status
                if latest.get("PARTY_SCREENING")
                else "N/A",
            },
            {
                "key": "dangerous_goods",
                "label": "Dangerous goods",
                "state": latest.get("DANGEROUS_GOODS").status
                if latest.get("DANGEROUS_GOODS")
                else "N/A",
            },
            {
                "key": "exceptions",
                "label": "Open exceptions",
                "state": state(exceptions == 0, review=exceptions > 0),
            },
            {"key": "approvals", "label": "Approvals", "state": "CLEAR"},
        ]

    def list_checks(
        self,
        *,
        organization_id: str,
        check_type: str | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = (
                select(AssuranceCheckRow, ShipmentCaseRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == AssuranceCheckRow.shipment_id)
                .where(AssuranceCheckRow.organization_id == organization_id)
            )
            if check_type:
                stmt = stmt.where(AssuranceCheckRow.check_type == check_type)
            if status:
                stmt = stmt.where(AssuranceCheckRow.status == status)
            rows = list(
                session.execute(
                    stmt.order_by(AssuranceCheckRow.created_at.desc()).limit(
                        max(1, min(limit, 200))
                    )
                )
            )
            return [
                {
                    **row_dict(check),
                    "details": json.loads(check.details_json),
                    "shipment_reference": shipment.internal_reference,
                }
                for check, shipment in rows
            ]

    def list_exceptions(
        self,
        *,
        organization_id: str,
        status: str | None = None,
        mine: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = (
                select(ShipmentExceptionRow, ShipmentCaseRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ShipmentExceptionRow.shipment_id)
                .where(ShipmentExceptionRow.organization_id == organization_id)
            )
            if status:
                stmt = stmt.where(ShipmentExceptionRow.status == status)
            if mine:
                stmt = stmt.where(ShipmentExceptionRow.assigned_to == mine)
            rows = list(
                session.execute(
                    stmt.order_by(ShipmentExceptionRow.created_at.desc()).limit(
                        max(1, min(limit, 200))
                    )
                )
            )
            return [
                {**row_dict(exc), "shipment_reference": shipment.internal_reference}
                for exc, shipment in rows
            ]

    def list_releases(self, *, organization_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            rows = list(
                session.execute(
                    select(ReleaseDecisionRow, ShipmentCaseRow, UserRow)
                    .join(ShipmentCaseRow, ShipmentCaseRow.id == ReleaseDecisionRow.shipment_id)
                    .join(UserRow, UserRow.id == ReleaseDecisionRow.decided_by)
                    .where(ShipmentCaseRow.organization_id == organization_id)
                    .order_by(ReleaseDecisionRow.created_at.desc())
                    .limit(max(1, min(limit, 200)))
                )
            )
            return [
                {
                    **row_dict(decision),
                    "shipment_reference": shipment.internal_reference,
                    "issued_by_name": user.display_name,
                }
                for decision, shipment, user in rows
            ]

    def list_jobs(
        self, *, organization_id: str, status: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = select(ProcessingJobRow).where(
                ProcessingJobRow.organization_id == organization_id
            )
            if status:
                stmt = stmt.where(ProcessingJobRow.status == status)
            return [
                row_dict(row)
                for row in session.scalars(
                    stmt.order_by(ProcessingJobRow.queued_at.desc()).limit(max(1, min(limit, 200)))
                )
            ]

    def list_connections(self, *, organization_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            return [
                {**row_dict(row), "configuration": json.loads(row.configuration_safe_json)}
                for row in session.scalars(
                    select(IntegrationConnectionRow)
                    .where(IntegrationConnectionRow.organization_id == organization_id)
                    .order_by(IntegrationConnectionRow.updated_at.desc())
                )
            ]

    def list_webhooks(self, *, organization_id: str) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            rows = list(
                session.scalars(
                    select(WebhookSubscriptionRow)
                    .where(WebhookSubscriptionRow.organization_id == organization_id)
                    .order_by(WebhookSubscriptionRow.updated_at.desc())
                )
            )
            return [
                {
                    **row_dict(row),
                    "events": json.loads(row.events_json),
                    "secret_configured": bool(row.secret_hash),
                }
                for row in rows
            ]

    def settings(self, *, organization_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            organization = session.get(OrganizationRow, organization_id)
            rows = list(
                session.scalars(
                    select(WorkspaceSettingRow).where(
                        WorkspaceSettingRow.organization_id == organization_id
                    )
                )
            )
            values = {row.setting_key: json.loads(row.value_json) for row in rows}
            return {
                "organization": row_dict(organization) if organization else None,
                "settings": values,
            }

    def save_settings(
        self, *, organization_id: str, user: UserRow, values: dict[str, Any]
    ) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            organization = session.get(OrganizationRow, organization_id)
            if organization is None:
                raise NotFoundError("Workspace was not found.")
            for key, value in values.items():
                if key in {"name", "default_timezone", "default_locale", "default_currency"}:
                    field = "name" if key == "name" else key
                    setattr(organization, field, str(value).strip())
                    organization.updated_at = now
                    continue
                setting = session.scalar(
                    select(WorkspaceSettingRow).where(
                        WorkspaceSettingRow.organization_id == organization_id,
                        WorkspaceSettingRow.setting_key == key,
                    )
                )
                if setting is None:
                    session.add(
                        WorkspaceSettingRow(
                            id=str(uuid.uuid4()),
                            organization_id=organization_id,
                            setting_key=key,
                            value_json=json.dumps(value),
                            updated_by=user.id,
                            updated_at=now,
                        )
                    )
                else:
                    setting.value_json = json.dumps(value)
                    setting.updated_by = user.id
                    setting.updated_at = now
            session.commit()
        return self.settings(organization_id=organization_id)

    def create_connection(
        self, *, organization_id: str, user: UserRow, payload: dict[str, Any]
    ) -> dict[str, Any]:
        now = now_utc()
        row = IntegrationConnectionRow(
            id=str(uuid.uuid4()),
            organization_id=organization_id,
            name=str(payload["name"]).strip(),
            type=str(payload["type"]),
            status="DISABLED",
            configuration_safe_json=json.dumps(payload.get("configuration", {})),
            credential_reference=None,
            created_at=now,
            updated_at=now,
        )
        with self.session_factory() as session:
            session.add(row)
            session.commit()
            session.refresh(row)
            return row_dict(row) | {"configuration": json.loads(row.configuration_safe_json)}

    def create_webhook(self, *, organization_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        secret = secrets.token_urlsafe(32)
        now = now_utc()
        row = WebhookSubscriptionRow(
            id=str(uuid.uuid4()),
            organization_id=organization_id,
            name=str(payload["name"]).strip(),
            endpoint=str(payload["endpoint"]).strip(),
            events_json=json.dumps(payload.get("events", [])),
            secret_hash=hashlib.sha256(secret.encode()).hexdigest(),
            enabled=True,
            created_at=now,
            updated_at=now,
        )
        with self.session_factory() as session:
            session.add(row)
            session.commit()
        return {
            "subscription": row_dict(row)
            | {"events": payload.get("events", []), "secret_configured": True},
            "secret": secret,
        }

    def create_service_token(
        self, *, organization_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        raw = f"gg_{secrets.token_urlsafe(32)}"
        now = now_utc()
        with self.session_factory() as session:
            account = ServiceAccountRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                name=str(payload["name"]).strip(),
                active=True,
                created_at=now,
            )
            session.add(account)
            session.flush()
            token = ApiTokenRow(
                id=str(uuid.uuid4()),
                service_account_id=account.id,
                token_hash=hashlib.sha256(raw.encode()).hexdigest(),
                prefix=raw[:10],
                scopes=json.dumps(payload.get("scopes", ["shipment.read"])),
                expires_at=None,
                revoked_at=None,
                last_used_at=None,
                created_at=now,
            )
            session.add(token)
            session.commit()
            return {
                "service_account": row_dict(account),
                "token": raw,
                "token_prefix": token.prefix,
            }

    def service_token_context(self, raw_token: str) -> tuple[str, UserRow, set[str]]:
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        now = now_utc()
        with self.session_factory() as session:
            row = session.execute(
                select(ApiTokenRow, ServiceAccountRow)
                .join(ServiceAccountRow, ServiceAccountRow.id == ApiTokenRow.service_account_id)
                .where(
                    ApiTokenRow.token_hash == token_hash,
                    ApiTokenRow.revoked_at.is_(None),
                    ServiceAccountRow.active.is_(True),
                )
            ).first()
            if row is None or (row[0].expires_at and row[0].expires_at <= now):
                raise GateGuardError(
                    "API token is invalid or expired.", code="INVALID_TOKEN", status_code=401
                )
            token, account = row
            user = session.scalar(
                select(UserRow)
                .join(WorkspaceMembershipRow, WorkspaceMembershipRow.user_id == UserRow.id)
                .where(
                    WorkspaceMembershipRow.organization_id == account.organization_id,
                    WorkspaceMembershipRow.active.is_(True),
                    UserRow.active.is_(True),
                )
                .order_by(UserRow.role.desc())
            )
            if user is None:
                raise GateGuardError(
                    "API token has no active workspace identity.", code="FORBIDDEN", status_code=403
                )
            token.last_used_at = now
            session.commit()
            return account.organization_id, user, set(json.loads(token.scopes or "[]"))

    def record_reconciliation_check(
        self,
        *,
        organization_id: str,
        shipment_id: str | None,
        user: UserRow,
        result: Any,
    ) -> dict[str, Any] | None:
        """Bring the original document-check flow into the assurance ledger."""
        if not shipment_id:
            return None
        now = now_utc()
        status = result.status.value if hasattr(result.status, "value") else str(result.status)
        severity = "LOW" if status == "CLEAR" else "HIGH" if status == "HOLD" else "MEDIUM"
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                return None
            check = AssuranceCheckRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment_id,
                check_type="DOCUMENT_RECONCILIATION",
                status=status,
                severity=severity,
                summary=result.reason,
                details_json=json.dumps(
                    {
                        "session_id": result.session_id,
                        "mismatches": [item.model_dump(mode="json") for item in result.mismatches],
                        "recommended_action": result.recommended_action,
                    }
                ),
                source="GateGuard document assurance",
                source_version="1",
                started_at=result.created_at,
                completed_at=now,
                created_at=now,
            )
            shipment.last_assessed_at = now
            shipment.updated_at = now
            if status in {"REVIEW", "HOLD"}:
                shipment.status = (
                    ShipmentStatus.HOLD.value
                    if status == "HOLD"
                    else ShipmentStatus.REVIEW_REQUIRED.value
                )
            session.add(check)
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="assurance.check.completed",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps({"check_type": check.check_type, "status": status}),
                    created_at=now,
                )
            )
            session.commit()
            return row_dict(check) | {"details": json.loads(check.details_json)}

    def update_exception(
        self,
        *,
        organization_id: str,
        exception_id: str,
        user: UserRow,
        status: str | None = None,
        assigned_to: str | None = None,
        resolution_code: str | None = None,
        resolution_note: str | None = None,
    ) -> dict[str, Any]:
        now = now_utc()
        allowed_statuses = {"OPEN", "IN_PROGRESS", "RESOLVED", "CANCELLED"}
        if status and status not in allowed_statuses:
            raise GateGuardError(
                "Invalid exception status.", code="VALIDATION_ERROR", status_code=422
            )
        with self.session_factory() as session:
            row = session.scalar(
                select(ShipmentExceptionRow).where(
                    ShipmentExceptionRow.id == exception_id,
                    ShipmentExceptionRow.organization_id == organization_id,
                )
            )
            if row is None:
                raise NotFoundError("Exception was not found in this workspace.")
            if status:
                row.status = status
            if assigned_to is not None:
                assignee = session.get(UserRow, assigned_to) if assigned_to else None
                if assigned_to and assignee is None:
                    raise NotFoundError("Assigned person was not found.")
                row.assigned_to = assigned_to or None
            if resolution_code is not None:
                row.resolution_code = resolution_code.strip() or None
            if resolution_note is not None:
                row.resolution_note = resolution_note.strip() or None
            if row.status == "RESOLVED":
                row.resolved_at = now
                row.resolved_by = user.id
            row.updated_at = now
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="exception.updated",
                    entity_type="exception",
                    entity_id=exception_id,
                    payload_json=json.dumps({"status": row.status}),
                    created_at=now,
                )
            )
            session.commit()
            return row_dict(row)

    def add_exception_comment(
        self, *, organization_id: str, exception_id: str, user: UserRow, body: str
    ) -> dict[str, Any]:
        text = " ".join(body.split())
        if len(text) < 2:
            raise GateGuardError(
                "Comment cannot be empty.", code="VALIDATION_ERROR", status_code=422
            )
        with self.session_factory() as session:
            exists = session.scalar(
                select(ShipmentExceptionRow.id).where(
                    ShipmentExceptionRow.id == exception_id,
                    ShipmentExceptionRow.organization_id == organization_id,
                )
            )
            if exists is None:
                raise NotFoundError("Exception was not found in this workspace.")
            row = ExceptionCommentRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                exception_id=exception_id,
                author_id=user.id,
                body=text,
                created_at=now_utc(),
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return row_dict(row) | {"author_name": user.display_name}

    def create_document_metadata(
        self, *, organization_id: str, user: UserRow, payload: dict[str, Any]
    ) -> dict[str, Any]:
        now = now_utc()
        document_type = str(payload["document_type"]).upper()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == payload["shipment_id"],
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            document = ShipmentDocumentRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment.id,
                document_type=document_type,
                requirement_id=payload.get("requirement_id"),
                current_version_id=None,
                status="UPLOADED",
                created_at=now,
                updated_at=now,
            )
            version = DocumentVersionRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                document_id=document.id,
                version=1,
                filename=str(payload["filename"]).strip(),
                mime_type=str(payload.get("mime_type") or "application/octet-stream"),
                size_bytes=int(payload.get("size_bytes") or 0),
                sha256=str(payload.get("sha256") or ""),
                uploaded_by=user.id,
                uploaded_at=now,
                storage_key=f"{organization_id}/{shipment.id}/{document.id}/1",
                extraction_status="QUEUED",
                extraction_provider=None,
                extraction_confidence=None,
                supersedes_version_id=None,
            )
            document.current_version_id = version.id
            session.add_all([document, version])
            evaluations = list(
                session.scalars(
                    select(RequirementEvaluationRow)
                    .join(
                        DocumentRequirementRow,
                        DocumentRequirementRow.id == RequirementEvaluationRow.requirement_id,
                    )
                    .where(
                        RequirementEvaluationRow.shipment_id == shipment.id,
                        DocumentRequirementRow.document_type == document_type,
                    )
                )
            )
            for evaluation in evaluations:
                evaluation.result = "PROVIDED"
                evaluation.reason = "Evidence is attached; content checks are pending."
                evaluation.evaluated_at = now
            session.add(
                ProcessingJobRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    shipment_id=shipment.id,
                    job_type="DOCUMENT_EXTRACTION",
                    status="QUEUED",
                    attempts=0,
                    max_attempts=3,
                    priority=50,
                    payload_json=json.dumps({"document_id": document.id, "version_id": version.id}),
                    queued_at=now,
                )
            )
            shipment.updated_at = now
            session.commit()
            session.refresh(document)
            return row_dict(document) | {"version": row_dict(version)}

    def approve_release(
        self, *, organization_id: str, release_decision_id: str, user: UserRow, comment: str
    ) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            decision = session.scalar(
                select(ReleaseDecisionRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ReleaseDecisionRow.shipment_id)
                .where(
                    ReleaseDecisionRow.id == release_decision_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if decision is None:
                raise NotFoundError("Release decision was not found in this workspace.")
            if decision.decided_by == user.id:
                raise GateGuardError(
                    "A second person must approve the release decision.",
                    code="FOUR_EYES_REQUIRED",
                    status_code=409,
                )
            duplicate = session.scalar(
                select(DecisionApprovalRow).where(
                    DecisionApprovalRow.release_decision_id == release_decision_id,
                    DecisionApprovalRow.approver_user_id == user.id,
                )
            )
            if duplicate:
                raise GateGuardError(
                    "You already approved this decision.",
                    code="DUPLICATE_APPROVAL",
                    status_code=409,
                )
            row = DecisionApprovalRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                release_decision_id=release_decision_id,
                approver_user_id=user.id,
                approval_type="SECOND_APPROVAL",
                comment=" ".join(comment.split()),
                approved_at=now,
            )
            session.add(row)
            session.commit()
            session.refresh(row)
            return row_dict(row) | {"approver_name": user.display_name}

    def transition_shipment(
        self, *, organization_id: str, shipment_id: str, user: UserRow, status: str
    ) -> dict[str, Any]:
        transitions = {
            ShipmentStatus.RELEASE_AUTHORIZED.value: {ShipmentStatus.DISPATCHED.value},
            ShipmentStatus.DISPATCHED.value: {ShipmentStatus.CLOSED.value},
            ShipmentStatus.HOLD.value: {ShipmentStatus.REVIEW_REQUIRED.value},
        }
        now = now_utc()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            previous_status = shipment.status
            if status not in transitions.get(shipment.status, set()):
                raise GateGuardError(
                    f"Shipment cannot move from {shipment.status} to {status}.",
                    code="INVALID_TRANSITION",
                    status_code=409,
                )
            if status == ShipmentStatus.DISPATCHED.value:
                latest = session.scalar(
                    select(ReleaseDecisionRow)
                    .where(
                        ReleaseDecisionRow.shipment_id == shipment_id,
                        ReleaseDecisionRow.decision == "AUTHORIZE",
                    )
                    .order_by(ReleaseDecisionRow.created_at.desc())
                )
                approved = (
                    session.scalar(
                        select(func.count(DecisionApprovalRow.id)).where(
                            DecisionApprovalRow.release_decision_id == latest.id
                        )
                    )
                    if latest
                    else 0
                )
                if not latest or not approved:
                    raise GateGuardError(
                        "A second approval is required before dispatch.",
                        code="FOUR_EYES_REQUIRED",
                        status_code=409,
                    )
                shipment.dispatched_at = now
            if status == ShipmentStatus.CLOSED.value:
                shipment.closed_at = now
            shipment.status = status
            shipment.updated_at = now
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="shipment.status.changed",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps({"from": previous_status, "to": status}),
                    created_at=now,
                )
            )
            session.commit()
            return row_dict(shipment)

    def overview(self, *, organization_id: str, start: datetime, end: datetime) -> dict[str, Any]:
        with self.session_factory() as session:
            shipment_count = (
                session.scalar(
                    select(func.count(ShipmentCaseRow.id)).where(
                        ShipmentCaseRow.organization_id == organization_id,
                        ShipmentCaseRow.created_at >= start,
                        ShipmentCaseRow.created_at < end,
                    )
                )
                or 0
            )
            active = (
                session.scalar(
                    select(func.count(ShipmentCaseRow.id)).where(
                        ShipmentCaseRow.organization_id == organization_id,
                        ShipmentCaseRow.status.not_in(
                            [ShipmentStatus.CLOSED.value, ShipmentStatus.DISPATCHED.value]
                        ),
                    )
                )
                or 0
            )
            open_exceptions = (
                session.scalar(
                    select(func.count(ShipmentExceptionRow.id)).where(
                        ShipmentExceptionRow.organization_id == organization_id,
                        ShipmentExceptionRow.status.not_in(["RESOLVED", "CANCELLED"]),
                    )
                )
                or 0
            )
            overdue = (
                session.scalar(
                    select(func.count(ShipmentExceptionRow.id)).where(
                        ShipmentExceptionRow.organization_id == organization_id,
                        ShipmentExceptionRow.due_at < now_utc(),
                        ShipmentExceptionRow.status.not_in(["RESOLVED", "CANCELLED"]),
                    )
                )
                or 0
            )
            authorized = (
                session.scalar(
                    select(func.count(ShipmentCaseRow.id)).where(
                        ShipmentCaseRow.organization_id == organization_id,
                        ShipmentCaseRow.status == ShipmentStatus.RELEASE_AUTHORIZED.value,
                    )
                )
                or 0
            )
            daily_events = list(
                session.execute(
                    select(
                        func.date(DomainEventRow.created_at),
                        DomainEventRow.event_type,
                        func.count(),
                    )
                    .where(
                        DomainEventRow.organization_id == organization_id,
                        DomainEventRow.created_at >= start,
                        DomainEventRow.created_at < end,
                    )
                    .group_by(func.date(DomainEventRow.created_at), DomainEventRow.event_type)
                    .order_by(func.date(DomainEventRow.created_at).asc())
                )
            )
            event_buckets: dict[str, list[tuple[int, int]]] = {}
            for day, event_type, count in daily_events:
                day_value = datetime.fromisoformat(str(day)).replace(tzinfo=UTC)
                event_buckets.setdefault(str(event_type), []).append(
                    (int(day_value.timestamp() * 1000), int(count))
                )
            colors = ["#2160fd", "#f6821f", "#147a50", "#805900", "#7b61ff"]
            series = [
                {
                    "name": event_type.replace(".", " ").title(),
                    "color": colors[index % len(colors)],
                    "data": points,
                }
                for index, (event_type, points) in enumerate(sorted(event_buckets.items()))
            ]
            return {
                "active_shipments": int(active),
                "assessments": int(shipment_count),
                "open_exceptions": int(open_exceptions),
                "overdue_work": int(overdue),
                "release_authorized": int(authorized),
                "series": series,
            }
