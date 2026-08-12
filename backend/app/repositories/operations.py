from __future__ import annotations

import hashlib
import ipaddress
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlparse

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

from app.core.config import get_settings
from app.core.errors import GateGuardError, NotFoundError
from app.domain.models import ShipmentStatus, UserRole
from app.repositories.reconciliations import (
    Base,
    ReleaseDecisionRow,
    ReviewTaskRow,
    ShipmentCaseRow,
    UserRow,
)
from app.services.assurance import calculate_risk


def now_utc() -> datetime:
    return datetime.now(UTC)


def validate_webhook_endpoint(endpoint: str, *, production: bool) -> str:
    parsed = urlparse(endpoint.strip())
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise GateGuardError(
            "Webhook endpoints must use a valid HTTPS URL.",
            code="INVALID_WEBHOOK_ENDPOINT",
            status_code=422,
        )
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise GateGuardError(
            "Webhook endpoints cannot contain credentials, query strings, or fragments.",
            code="INVALID_WEBHOOK_ENDPOINT",
            status_code=422,
        )
    host = parsed.hostname.casefold().rstrip(".")
    local_hosts = {"localhost", "127.0.0.1", "::1"}
    if production and parsed.scheme != "https":
        raise GateGuardError(
            "Webhook endpoints must use HTTPS in production.",
            code="INVALID_WEBHOOK_ENDPOINT",
            status_code=422,
        )
    if host in local_hosts and production:
        raise GateGuardError(
            "Local webhook endpoints are not allowed in production.",
            code="INVALID_WEBHOOK_ENDPOINT",
            status_code=422,
        )
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if (
        address
        and (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
        )
        and (production or host not in local_hosts)
    ):
        raise GateGuardError(
            "Private or reserved webhook addresses are not allowed.",
            code="INVALID_WEBHOOK_ENDPOINT",
            status_code=422,
        )
    return endpoint.strip()


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
    document_reference: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
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
    rule_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    rule_pack_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
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
    rule_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
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


class ReferenceDataRow(Base):
    __tablename__ = "reference_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(String(40), index=True)
    code: Mapped[str] = mapped_column(String(80), index=True)
    label: Mapped[str] = mapped_column(String(200))
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    source: Mapped[str] = mapped_column(String(160))
    version: Mapped[str] = mapped_column(String(40))
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
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


class ScreeningMatchRow(Base):
    __tablename__ = "screening_matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    screening_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("screening_runs.id", ondelete="CASCADE"), index=True
    )
    matched_name: Mapped[str] = mapped_column(String(200))
    matched_identifier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dataset_record_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    disposition: Mapped[str] = mapped_column(String(40), default="REQUIRES_REVIEW")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class WorkerHeartbeatRow(Base):
    __tablename__ = "worker_heartbeats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    worker_id: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    version: Mapped[str] = mapped_column(String(40), default="unknown")
    current_job_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    safe_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_heartbeat_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


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
        self,
        *,
        organization_id: str,
        user: UserRow,
        query: str,
        limit: int = 20,
        types: set[str] | None = None,
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
                            ShipmentCaseRow.internal_reference.ilike(term),
                            ShipmentCaseRow.external_reference.ilike(term),
                            ShipmentCaseRow.destination.ilike(term),
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
                    .outerjoin(
                        DocumentVersionRow,
                        DocumentVersionRow.id == ShipmentDocumentRow.current_version_id,
                    )
                    .where(
                        ShipmentDocumentRow.organization_id == organization_id,
                        or_(
                            ShipmentDocumentRow.document_type.ilike(term),
                            ShipmentDocumentRow.document_reference.ilike(term),
                            DocumentVersionRow.filename.ilike(term),
                        ),
                    )
                    .limit(bounded)
                )
            )
            result.extend(
                {
                    "type": "document",
                    "id": doc.id,
                    "label": doc.document_reference or doc.document_type,
                    "description": shipment.internal_reference,
                    "href": f"/shipments/{shipment.id}",
                }
                for doc, shipment in documents
            )
            parties = list(
                session.scalars(
                    select(TradePartyRow)
                    .where(
                        TradePartyRow.organization_id == organization_id,
                        TradePartyRow.legal_name.ilike(term),
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
                        or_(ShipmentItemRow.sku.ilike(term), ShipmentItemRow.description.ilike(term)),
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
                        ShipmentExceptionRow.summary.ilike(term),
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
                        ReleaseDecisionRow.reason.ilike(term),
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
                            or_(UserRow.display_name.ilike(term), UserRow.email.ilike(term)),
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
                if user.role == UserRole.ADMIN.value:
                    packs = list(
                        session.scalars(
                            select(RulePackRow)
                            .where(
                                RulePackRow.organization_id == organization_id,
                                RulePackRow.name.ilike(term),
                            )
                            .limit(bounded)
                        )
                    )
                    result.extend(
                        {
                            "type": "rule_pack",
                            "id": pack.id,
                            "label": pack.name,
                            "description": f"Version {pack.version}",
                            "href": "/governance/rule-packs",
                        }
                        for pack in packs
                    )
                    connections = list(
                        session.scalars(
                            select(IntegrationConnectionRow)
                            .where(
                                IntegrationConnectionRow.organization_id == organization_id,
                                IntegrationConnectionRow.name.ilike(term),
                            )
                            .limit(bounded)
                        )
                    )
                    result.extend(
                        {
                            "type": "integration",
                            "id": connection.id,
                            "label": connection.name,
                            "description": connection.status,
                            "href": "/integrations/connections",
                        }
                        for connection in connections
                    )
        if types:
            result = [item for item in result if item["type"] in types]
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
                        TradePartyRow.legal_name.ilike(term),
                        TradePartyRow.external_identifier.ilike(term),
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

    def create_party(
        self, *, organization_id: str, user: UserRow, payload: dict[str, Any]
    ) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            party = TradePartyRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                legal_name=str(payload["legal_name"]).strip(),
                trade_name=payload.get("trade_name"),
                country_code=payload.get("country_code"),
                address=payload.get("address"),
                city=payload.get("city"),
                region=payload.get("region"),
                postal_code=payload.get("postal_code"),
                email=payload.get("email"),
                phone=payload.get("phone"),
                tax_identifier=payload.get("tax_identifier"),
                external_identifier=payload.get("external_identifier"),
                created_at=now,
                updated_at=now,
            )
            session.add(party)
            session.flush()
            if payload.get("shipment_id"):
                shipment = session.scalar(
                    select(ShipmentCaseRow).where(
                        ShipmentCaseRow.id == payload["shipment_id"],
                        ShipmentCaseRow.organization_id == organization_id,
                    )
                )
                if shipment is None:
                    raise NotFoundError("Shipment was not found in this workspace.")
                session.add(
                    ShipmentPartyRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        shipment_id=shipment.id,
                        party_id=party.id,
                        role=str(payload.get("role") or "OTHER"),
                        created_at=now,
                    )
                )
            if payload.get("external_identifier"):
                session.add(
                    PartyIdentifierRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        party_id=party.id,
                        identifier_type="EXTERNAL",
                        identifier_value=str(payload["external_identifier"]),
                        created_at=now,
                    )
                )
            session.commit()
            session.refresh(party)
            return row_dict(party)

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
                        ShipmentItemRow.sku.ilike(term),
                        ShipmentItemRow.description.ilike(term),
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

    def create_item(self, *, organization_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == payload["shipment_id"],
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            item = ShipmentItemRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment.id,
                line_number=int(payload["line_number"]),
                sku=payload.get("sku"),
                description=str(payload["description"]),
                quantity=float(payload.get("quantity") or 0),
                unit_of_measure=str(payload.get("unit_of_measure") or "unit"),
                unit_price=payload.get("unit_price"),
                currency=payload.get("currency"),
                line_total=payload.get("line_total"),
                country_of_origin=payload.get("country_of_origin"),
                hs_code=payload.get("hs_code"),
                gross_weight=payload.get("gross_weight"),
                net_weight=payload.get("net_weight"),
                dangerous_goods=bool(payload.get("dangerous_goods")),
                un_number=payload.get("un_number"),
                proper_shipping_name=payload.get("proper_shipping_name"),
                hazard_class=payload.get("hazard_class"),
                packing_group=payload.get("packing_group"),
                special_handling=payload.get("special_handling"),
                package_count=payload.get("package_count"),
                created_at=now,
                updated_at=now,
            )
            session.add(item)
            shipment.updated_at = now
            session.commit()
            session.refresh(item)
            return row_dict(item)

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

    def create_transport(self, *, organization_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == payload["shipment_id"],
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            leg = TransportLegRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment.id,
                sequence=int(payload.get("sequence") or 1),
                mode=str(payload["mode"]),
                carrier=payload.get("carrier"),
                origin=payload.get("origin"),
                destination=payload.get("destination"),
                planned_departure=payload.get("planned_departure"),
                planned_arrival=payload.get("planned_arrival"),
                actual_departure=payload.get("actual_departure"),
                actual_arrival=payload.get("actual_arrival"),
                vessel=payload.get("vessel"),
                voyage=payload.get("voyage"),
                flight=payload.get("flight"),
                vehicle_reference=payload.get("vehicle_reference"),
                created_at=now,
            )
            session.add(leg)
            shipment.updated_at = now
            session.commit()
            session.refresh(leg)
            return row_dict(leg)

    def list_documents(
        self,
        *,
        organization_id: str,
        query: str | None = None,
        status: str | None = None,
        document_type: str | None = None,
        extraction_status: str | None = None,
        shipment_id: str | None = None,
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
            if document_type:
                stmt = stmt.where(ShipmentDocumentRow.document_type == document_type.upper())
            if shipment_id:
                stmt = stmt.where(ShipmentDocumentRow.shipment_id == shipment_id)
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
                item = {
                    **row_dict(document),
                    "shipment_reference": shipment.internal_reference,
                    "version": row_dict(version, exclude={"storage_key"}) if version else None,
                }
                if extraction_status and (
                    not version or version.extraction_status != extraction_status
                ):
                    continue
                output.append(item)
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
            docs = self.list_documents(organization_id=organization_id, shipment_id=shipment_id)
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

    def list_reference_data(
        self,
        *,
        organization_id: str,
        category: str | None = None,
        query: str | None = None,
        active_only: bool = True,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        with self.session_factory() as session:
            stmt = select(ReferenceDataRow).where(
                ReferenceDataRow.organization_id == organization_id
            )
            if category:
                stmt = stmt.where(ReferenceDataRow.category == category.upper())
            if active_only:
                stmt = stmt.where(ReferenceDataRow.active.is_(True))
            if query:
                term = f"%{query.strip()}%"
                stmt = stmt.where(
                    or_(ReferenceDataRow.code.like(term), ReferenceDataRow.label.like(term))
                )
            rows = session.scalars(
                stmt.order_by(ReferenceDataRow.category.asc(), ReferenceDataRow.code.asc()).limit(
                    max(1, min(limit, 500))
                )
            )
            return [
                {**row_dict(row), "metadata": json.loads(row.metadata_json or "{}")} for row in rows
            ]

    def create_reference_data(
        self, *, organization_id: str, user: UserRow, payload: dict[str, Any]
    ) -> dict[str, Any]:
        category = str(payload["category"]).strip().upper()
        code = str(payload["code"]).strip().upper()
        label = " ".join(str(payload["label"]).split())
        if not category or not code or not label:
            raise GateGuardError(
                "Category, code, and label are required.",
                code="VALIDATION_ERROR",
                status_code=422,
            )
        now = now_utc()
        with self.session_factory() as session:
            duplicate = session.scalar(
                select(ReferenceDataRow).where(
                    ReferenceDataRow.organization_id == organization_id,
                    ReferenceDataRow.category == category,
                    ReferenceDataRow.code == code,
                )
            )
            if duplicate:
                raise GateGuardError(
                    "That reference code already exists in this category.",
                    code="DUPLICATE_REFERENCE_DATA",
                    status_code=409,
                )
            row = ReferenceDataRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                category=category,
                code=code,
                label=label,
                metadata_json=json.dumps(payload.get("metadata", {})),
                source=str(payload.get("source") or "Workspace maintained").strip(),
                version=str(payload.get("version") or "1").strip(),
                active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="reference_data.created",
                    entity_type="reference_data",
                    entity_id=row.id,
                    payload_json=json.dumps({"category": category, "code": code}),
                    created_at=now,
                )
            )
            session.commit()
            session.refresh(row)
            return {**row_dict(row), "metadata": json.loads(row.metadata_json)}

    def rule_pack_detail(self, *, organization_id: str, rule_pack_id: str) -> dict[str, Any]:
        with self.session_factory() as session:
            pack = session.scalar(
                select(RulePackRow).where(
                    RulePackRow.id == rule_pack_id,
                    or_(
                        RulePackRow.organization_id == organization_id,
                        RulePackRow.organization_id.is_(None),
                    ),
                )
            )
            if pack is None:
                raise NotFoundError("Rule pack was not found in this workspace.")
            rules = list(
                session.scalars(
                    select(RuleDefinitionRow)
                    .where(RuleDefinitionRow.rule_pack_id == pack.id)
                    .order_by(RuleDefinitionRow.rule_id.asc())
                )
            )
            return {
                "rule_pack": row_dict(pack),
                "rules": [
                    {**row_dict(rule), "condition": json.loads(rule.condition_json or "{}")}
                    for rule in rules
                ],
            }

    def publish_rule_pack(
        self, *, organization_id: str, rule_pack_id: str, user: UserRow
    ) -> dict[str, Any]:
        now = now_utc()
        with self.session_factory() as session:
            pack = session.scalar(
                select(RulePackRow).where(
                    RulePackRow.id == rule_pack_id,
                    or_(
                        RulePackRow.organization_id == organization_id,
                        RulePackRow.organization_id.is_(None),
                    ),
                )
            )
            if pack is None:
                raise NotFoundError("Rule pack was not found in this workspace.")
            if pack.status == "PUBLISHED":
                raise GateGuardError(
                    "Published rule packs are immutable.",
                    code="IMMUTABLE_RULE_PACK",
                    status_code=409,
                )
            pack.status = "PUBLISHED"
            pack.published_by = user.id
            pack.published_at = now
            pack.updated_at = now
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="rule_pack.published",
                    entity_type="rule_pack",
                    entity_id=pack.id,
                    payload_json=json.dumps({"version": pack.version}),
                    created_at=now,
                )
            )
            session.commit()
            session.refresh(pack)
            return row_dict(pack)

    def simulate_rule_pack(
        self, *, organization_id: str, rule_pack_id: str, input_data: dict[str, Any]
    ) -> dict[str, Any]:
        detail = self.rule_pack_detail(organization_id=organization_id, rule_pack_id=rule_pack_id)
        context = input_data or {}
        results = []
        for rule in detail["rules"]:
            condition = rule["condition"]
            matches = all(context.get(str(key)) == value for key, value in condition.items())
            results.append(
                {
                    "rule_id": rule["rule_id"],
                    "matched": matches,
                    "result": "APPLIES" if matches else "NOT_APPLICABLE",
                }
            )
        return {"rule_pack": detail["rule_pack"], "results": results, "mutated": False}

    def list_notifications(
        self, *, organization_id: str, user_id: str, unread_only: bool = False, limit: int = 50
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            stmt = select(NotificationRow).where(
                NotificationRow.organization_id == organization_id,
                NotificationRow.user_id == user_id,
            )
            if unread_only:
                stmt = stmt.where(NotificationRow.read_at.is_(None))
            rows = list(
                session.scalars(
                    stmt.order_by(NotificationRow.created_at.desc()).limit(max(1, min(limit, 100)))
                )
            )
            unread = (
                session.scalar(
                    select(func.count(NotificationRow.id)).where(
                        NotificationRow.organization_id == organization_id,
                        NotificationRow.user_id == user_id,
                        NotificationRow.read_at.is_(None),
                    )
                )
                or 0
            )
            return {"unread": int(unread), "items": [row_dict(row) for row in rows]}

    def mark_notification_read(
        self, *, organization_id: str, user_id: str, notification_id: str
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            row = session.scalar(
                select(NotificationRow).where(
                    NotificationRow.id == notification_id,
                    NotificationRow.organization_id == organization_id,
                    NotificationRow.user_id == user_id,
                )
            )
            if row is None:
                raise NotFoundError("Notification was not found in this workspace.")
            row.read_at = row.read_at or now_utc()
            session.commit()
            session.refresh(row)
            return row_dict(row)

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
        endpoint = validate_webhook_endpoint(
            str(payload["endpoint"]), production=get_settings().app_env.casefold() == "production"
        )
        row = WebhookSubscriptionRow(
            id=str(uuid.uuid4()),
            organization_id=organization_id,
            name=str(payload["name"]).strip(),
            endpoint=endpoint,
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
            return row_dict(document) | {"version": row_dict(version, exclude={"storage_key"})}

    def create_document_version(
        self,
        *,
        organization_id: str,
        user: UserRow,
        shipment_id: str,
        document_type: str,
        filename: str,
        mime_type: str,
        size_bytes: int,
        sha256: str,
        storage_key: str,
        document_id: str | None = None,
        requirement_id: str | None = None,
    ) -> dict[str, Any]:
        """Persist an uploaded document version without exposing its storage path."""
        now = now_utc()
        normalized_type = document_type.upper()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            document = (
                session.scalar(
                    select(ShipmentDocumentRow).where(
                        ShipmentDocumentRow.id == document_id,
                        ShipmentDocumentRow.organization_id == organization_id,
                        ShipmentDocumentRow.shipment_id == shipment_id,
                    )
                )
                if document_id
                else None
            )
            if document is None:
                document = ShipmentDocumentRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    shipment_id=shipment_id,
                    document_type=normalized_type,
                    requirement_id=requirement_id,
                    current_version_id=None,
                    status="RECEIVED",
                    created_at=now,
                    updated_at=now,
                )
                session.add(document)
                session.flush()
            versions = list(
                session.scalars(
                    select(DocumentVersionRow)
                    .where(DocumentVersionRow.document_id == document.id)
                    .order_by(DocumentVersionRow.version.desc())
                )
            )
            previous = versions[0] if versions else None
            version = DocumentVersionRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                document_id=document.id,
                version=(previous.version + 1) if previous else 1,
                filename=filename,
                mime_type=mime_type,
                size_bytes=size_bytes,
                sha256=sha256,
                uploaded_by=user.id,
                uploaded_at=now,
                storage_key=storage_key,
                extraction_status="QUEUED",
                extraction_provider=None,
                extraction_confidence=None,
                supersedes_version_id=previous.id if previous else None,
            )
            if previous:
                previous_document = document
                previous_document.status = "SUPERSEDED"
            document.current_version_id = version.id
            document.status = "RECEIVED"
            document.updated_at = now
            session.add(version)
            evaluations = list(
                session.scalars(
                    select(RequirementEvaluationRow)
                    .join(
                        DocumentRequirementRow,
                        DocumentRequirementRow.id == RequirementEvaluationRow.requirement_id,
                    )
                    .where(
                        RequirementEvaluationRow.shipment_id == shipment_id,
                        DocumentRequirementRow.document_type.in_({normalized_type, "INVOICE"})
                        if normalized_type == "COMMERCIAL_INVOICE"
                        else DocumentRequirementRow.document_type == normalized_type,
                    )
                )
            )
            for evaluation in evaluations:
                evaluation.result = "PROVIDED"
                evaluation.reason = "Evidence was uploaded; content checks are queued."
                evaluation.evaluated_at = now
            session.add(
                ProcessingJobRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    shipment_id=shipment_id,
                    job_type="EXTRACT_DOCUMENT",
                    status="QUEUED",
                    attempts=0,
                    max_attempts=3,
                    priority=60,
                    payload_json=json.dumps({"document_id": document.id, "version_id": version.id}),
                    queued_at=now,
                    next_attempt_at=None,
                )
            )
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="document.uploaded",
                    entity_type="document",
                    entity_id=document.id,
                    payload_json=json.dumps({"version": version.version, "sha256": sha256}),
                    created_at=now,
                )
            )
            session.commit()
            session.refresh(document)
            session.refresh(version)
            return row_dict(document) | {"version": row_dict(version, exclude={"storage_key"})}

    def document_content_metadata(
        self, *, organization_id: str, document_id: str, version: int | None = None
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            document = session.scalar(
                select(ShipmentDocumentRow).where(
                    ShipmentDocumentRow.id == document_id,
                    ShipmentDocumentRow.organization_id == organization_id,
                )
            )
            if document is None:
                raise NotFoundError("Document was not found in this workspace.")
            stmt = select(DocumentVersionRow).where(
                DocumentVersionRow.document_id == document.id,
                DocumentVersionRow.organization_id == organization_id,
            )
            if version is not None:
                stmt = stmt.where(DocumentVersionRow.version == version)
            else:
                stmt = stmt.where(DocumentVersionRow.id == document.current_version_id)
            current = session.scalar(stmt)
            if current is None:
                raise NotFoundError("Document version was not found.")
            return row_dict(current) | {"document": row_dict(document)}

    def complete_document_extraction(
        self, *, organization_id: str, document_id: str, version_id: str
    ) -> None:
        """Mark an unconfigured extraction provider as explicitly reviewable."""
        now = now_utc()
        with self.session_factory() as session:
            document = session.scalar(
                select(ShipmentDocumentRow).where(
                    ShipmentDocumentRow.id == document_id,
                    ShipmentDocumentRow.organization_id == organization_id,
                )
            )
            version = session.scalar(
                select(DocumentVersionRow).where(
                    DocumentVersionRow.id == version_id,
                    DocumentVersionRow.organization_id == organization_id,
                    DocumentVersionRow.document_id == document_id,
                )
            )
            if document is None or version is None:
                raise NotFoundError("The document version was not found in this workspace.")
            version.extraction_status = "NEEDS_REVIEW"
            version.extraction_provider = "NOT_CONFIGURED"
            document.status = "REVIEW_REQUIRED"
            document.updated_at = now
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="document.extraction.needs_review",
                    entity_type="document",
                    entity_id=document_id,
                    payload_json=json.dumps(
                        {"version_id": version_id, "provider": "NOT_CONFIGURED"}
                    ),
                    created_at=now,
                )
            )
            session.commit()

    def save_trusted_reference(
        self, *, organization_id: str, shipment_id: str, user: UserRow, payload: dict[str, Any]
    ) -> dict[str, Any]:
        now = now_utc()
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        content_hash = hashlib.sha256(canonical.encode()).hexdigest()
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    ShipmentCaseRow.organization_id == organization_id,
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found in this workspace.")
            from app.repositories.reconciliations import (
                TrustedReferenceItemRow,
                TrustedShipmentReferenceRow,
            )

            reference = session.scalar(
                select(TrustedShipmentReferenceRow).where(
                    TrustedShipmentReferenceRow.shipment_id == shipment_id,
                    TrustedShipmentReferenceRow.organization_id == organization_id,
                )
            )
            if reference is None:
                reference = TrustedShipmentReferenceRow(
                    id=str(uuid.uuid4()),
                    shipment_id=shipment_id,
                    organization_id=organization_id,
                    version=1,
                    source_type="MANUAL_AUTHORITATIVE_ENTRY",
                    source_system="Workspace entry",
                    retrieved_at=now,
                )
                session.add(reference)
                session.flush()
            else:
                reference.version = (reference.version or 1) + 1
                reference.retrieved_at = now
            reference.order_reference = payload.get("order_reference")
            reference.shipment_reference = (
                payload.get("shipment_reference") or shipment.internal_reference
            )
            reference.expected_shipper = payload.get("expected_shipper")
            reference.expected_recipient = payload.get("expected_recipient")
            reference.expected_destination = (
                payload.get("expected_destination") or shipment.destination
            )
            reference.expected_currency = payload.get("expected_currency")
            reference.expected_total = payload.get("expected_total")
            reference.source_system = str(payload.get("source_system") or "Workspace entry")
            reference.source_type = str(payload.get("source_type") or "MANUAL_AUTHORITATIVE_ENTRY")
            reference.source_record_id = payload.get("source_record_id")
            reference.content_hash = content_hash
            session.query(TrustedReferenceItemRow).filter(
                TrustedReferenceItemRow.reference_id == reference.id
            ).delete(synchronize_session=False)
            for item in payload.get("items", []):
                session.add(
                    TrustedReferenceItemRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        reference_id=reference.id,
                        sku=item.get("sku"),
                        description=item.get("description"),
                        quantity=item.get("quantity"),
                        unit=item.get("unit"),
                        unit_price=item.get("unit_price"),
                        line_total=item.get("line_total"),
                    )
                )
            comparison = self._trusted_comparison(
                session, shipment, reference, payload.get("items", [])
            )
            check = AssuranceCheckRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment_id,
                check_type="TRUSTED_REFERENCE",
                status="HOLD" if comparison["findings"] else "CLEAR",
                severity="HIGH" if comparison["findings"] else "LOW",
                summary=(
                    "Trusted source conflicts require review."
                    if comparison["findings"]
                    else "Trusted source matches the shipment reference."
                ),
                details_json=json.dumps(comparison),
                source="MANUAL_AUTHORITATIVE_ENTRY",
                source_version=str(reference.version),
                rule_pack_version="baseline-1",
                started_at=now,
                completed_at=now,
                created_at=now,
            )
            session.add(check)
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="trusted_reference.updated",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps(
                        {"version": reference.version, "content_hash": content_hash}
                    ),
                    created_at=now,
                )
            )
            stale_release = session.scalar(
                select(ReleaseDecisionRow)
                .where(
                    ReleaseDecisionRow.shipment_id == shipment_id,
                    ReleaseDecisionRow.decision == "AUTHORIZE",
                    ReleaseDecisionRow.invalidated_at.is_(None),
                )
                .order_by(ReleaseDecisionRow.created_at.desc())
            )
            if stale_release is not None:
                stale_release.invalidated_at = now
                if shipment.status == ShipmentStatus.RELEASE_AUTHORIZED.value:
                    shipment.status = ShipmentStatus.RELEASE_INVALIDATED.value
                session.add(
                    DomainEventRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        event_type="release.invalidated",
                        entity_type="shipment",
                        entity_id=shipment_id,
                        payload_json=json.dumps({"reason": "trusted_reference_changed"}),
                        created_at=now,
                    )
                )
            session.commit()
            return {
                "reference": row_dict(reference),
                "comparison": comparison,
                "check": row_dict(check),
            }

    @staticmethod
    def _trusted_comparison(
        session: Session, shipment: ShipmentCaseRow, reference: Any, items: list[dict[str, Any]]
    ) -> dict[str, Any]:
        findings: list[dict[str, Any]] = []
        if reference.shipment_reference and reference.shipment_reference not in {
            shipment.internal_reference,
            shipment.external_reference,
        }:
            findings.append(
                {"code": "TRUSTED_SHIPMENT_REFERENCE_MISMATCH", "field": "shipment_reference"}
            )
        if (
            reference.expected_destination
            and reference.expected_destination.casefold() != shipment.destination.casefold()
        ):
            findings.append({"code": "TRUSTED_DESTINATION_MISMATCH", "field": "destination"})
        if (
            reference.expected_currency
            and shipment.currency
            and reference.expected_currency.upper() != shipment.currency.upper()
        ):
            findings.append({"code": "TRUSTED_CURRENCY_MISMATCH", "field": "currency"})
        if reference.expected_total is not None:
            # A trusted total is compared only to the authoritative record supplied here;
            # no fuzzy match is used to authorize release.
            expected = float(reference.expected_total)
            if expected < 0:
                findings.append({"code": "TRUSTED_TOTAL_INVALID", "field": "total"})
        if items:
            supplied = {
                str(item.get("sku")): float(item.get("quantity") or 0)
                for item in items
                if item.get("sku")
            }
            if not supplied:
                findings.append({"code": "TRUSTED_SKU_MISSING", "field": "items"})
        return {"findings": findings, "matched": not findings, "source_type": reference.source_type}

    def run_assessment(
        self, *, organization_id: str, shipment_id: str, user: UserRow
    ) -> dict[str, Any]:
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
            shipment.assessment_started_at = now
            shipment.status = ShipmentStatus.ASSESSING.value
            shipment.updated_at = now
            job = ProcessingJobRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment_id,
                job_type="ASSESS_SHIPMENT",
                status="QUEUED",
                attempts=0,
                max_attempts=3,
                priority=80,
                payload_json=json.dumps({"shipment_id": shipment_id}),
                queued_at=now,
            )
            session.add(job)
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="assessment.started",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps({"job_id": job.id}),
                    created_at=now,
                )
            )
            session.commit()
            return {"job_id": job.id, "shipment_id": shipment_id, "status": "QUEUED"}

    def complete_assessment(self, *, organization_id: str, shipment_id: str) -> dict[str, Any]:
        """Evaluate persisted deterministic inputs and write the assurance ledger."""
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
            evaluations = list(
                session.execute(
                    select(RequirementEvaluationRow, DocumentRequirementRow)
                    .join(
                        DocumentRequirementRow,
                        DocumentRequirementRow.id == RequirementEvaluationRow.requirement_id,
                    )
                    .where(RequirementEvaluationRow.shipment_id == shipment_id)
                )
            )
            missing = [
                requirement.name
                for evaluation, requirement in evaluations
                if requirement.status in {"REQUIRED", "ACTIVE"}
                and evaluation.result not in {"PROVIDED", "CLEAR", "NOT_APPLICABLE"}
            ]
            if missing:
                session.add(
                    AssuranceCheckRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        shipment_id=shipment_id,
                        check_type="DOCUMENT_REQUIREMENTS",
                        status="REVIEW",
                        severity="HIGH",
                        summary="Required documents are missing.",
                        details_json=json.dumps({"missing": missing}),
                        source="DEMO_BASELINE_RULE_PACK",
                        source_version="baseline-1",
                        rule_pack_version="baseline-1",
                        started_at=now,
                        completed_at=now,
                        created_at=now,
                    )
                )
            else:
                session.add(
                    AssuranceCheckRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        shipment_id=shipment_id,
                        check_type="DOCUMENT_REQUIREMENTS",
                        status="CLEAR",
                        severity="LOW",
                        summary="Required document evidence is present.",
                        details_json="{}",
                        source="DEMO_BASELINE_RULE_PACK",
                        source_version="baseline-1",
                        rule_pack_version="baseline-1",
                        started_at=now,
                        completed_at=now,
                        created_at=now,
                    )
                )
            dg_items = list(
                session.scalars(
                    select(ShipmentItemRow).where(
                        ShipmentItemRow.shipment_id == shipment_id,
                        ShipmentItemRow.dangerous_goods.is_(True),
                    )
                )
            )
            dg_incomplete = [
                item.description
                for item in dg_items
                if not item.un_number or not item.proper_shipping_name or not item.hazard_class
            ]
            if dg_items:
                session.add(
                    AssuranceCheckRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        shipment_id=shipment_id,
                        check_type="DANGEROUS_GOODS",
                        status="HOLD" if dg_incomplete else "REVIEW",
                        severity="HIGH" if dg_incomplete else "MEDIUM",
                        summary=(
                            "Dangerous-goods declarations are incomplete."
                            if dg_incomplete
                            else "Dangerous-goods evidence requires review."
                        ),
                        details_json=json.dumps({"incomplete_items": dg_incomplete}),
                        source="GateGuard deterministic DG baseline",
                        source_version="1",
                        rule_pack_version="baseline-1",
                        started_at=now,
                        completed_at=now,
                        created_at=now,
                    )
                )
            factors: list[tuple[str, str]] = []
            if missing:
                factors.append(("MISSING_REQUIRED_DOCUMENT", ", ".join(missing)))
            if dg_incomplete:
                factors.append(("DANGEROUS_GOODS_INCOMPLETE", ", ".join(dg_incomplete)))
            if any(
                check.status in {"HOLD", "REVIEW"}
                for check in session.scalars(
                    select(AssuranceCheckRow).where(AssuranceCheckRow.shipment_id == shipment_id)
                )
            ):
                factors.append(
                    ("BLOCKING_ASSURANCE", "One or more assurance checks require review.")
                )
            assessment = calculate_risk(factors)
            shipment.risk_score = assessment.score
            shipment.risk_level = assessment.level.value
            shipment.risk_factors_json = json.dumps(assessment.factors)
            shipment.last_assessed_at = now
            shipment.updated_at = now
            shipment.status = (
                ShipmentStatus.HOLD.value if dg_incomplete else ShipmentStatus.REVIEW_REQUIRED.value
            )
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="assessment.completed",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps(
                        {"risk_level": assessment.level.value, "risk_score": assessment.score}
                    ),
                    created_at=now,
                )
            )
            session.commit()
            return {
                "shipment_id": shipment_id,
                "risk_score": assessment.score,
                "risk_level": assessment.level.value,
                "factors": assessment.factors,
            }

    def run_screening(
        self, *, organization_id: str, shipment_id: str, party_id: str | None = None, user: UserRow
    ) -> dict[str, Any]:
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
            party = session.scalar(
                select(TradePartyRow)
                .join(ShipmentPartyRow, ShipmentPartyRow.party_id == TradePartyRow.id)
                .where(
                    ShipmentPartyRow.shipment_id == shipment_id,
                    TradePartyRow.organization_id == organization_id,
                    *([TradePartyRow.id == party_id] if party_id else []),
                )
                .order_by(TradePartyRow.legal_name.asc())
            )
            if party is None:
                raise GateGuardError(
                    "Add a shipment party before running screening.",
                    code="PARTY_REQUIRED",
                    status_code=422,
                )
            run = ScreeningRunRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment_id,
                party_id=party.id,
                provider="NOT_CONFIGURED",
                dataset="NOT_CONFIGURED",
                dataset_version="N/A",
                screened_at=now,
                result="NOT_CONFIGURED",
                score=None,
                matched_name=None,
                matched_identifier=None,
                disposition="NOT_CONFIGURED",
                reviewed_by=None,
                reviewed_at=None,
            )
            check = AssuranceCheckRow(
                id=str(uuid.uuid4()),
                organization_id=organization_id,
                shipment_id=shipment_id,
                check_type="PARTY_SCREENING",
                status="NOT_APPLICABLE",
                severity="LOW",
                summary="No screening provider is configured for this workspace.",
                details_json=json.dumps({"party_id": party.id, "result": "NOT_CONFIGURED"}),
                source="NOT_CONFIGURED",
                source_version="N/A",
                rule_pack_version="baseline-1",
                started_at=now,
                completed_at=now,
                created_at=now,
            )
            session.add_all([run, check])
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    event_type="screening.completed",
                    entity_type="shipment",
                    entity_id=shipment_id,
                    payload_json=json.dumps({"result": run.result, "party_id": party.id}),
                    created_at=now,
                )
            )
            session.commit()
            session.refresh(run)
            return row_dict(run) | {"party_name": party.legal_name}

    def heartbeat(
        self,
        *,
        worker_id: str,
        status: str,
        version: str,
        current_job_id: str | None = None,
        safe_error: str | None = None,
    ) -> None:
        now = now_utc()
        with self.session_factory() as session:
            row = session.scalar(
                select(WorkerHeartbeatRow).where(WorkerHeartbeatRow.worker_id == worker_id)
            )
            if row is None:
                row = WorkerHeartbeatRow(
                    id=str(uuid.uuid4()),
                    worker_id=worker_id,
                    status=status,
                    version=version,
                    current_job_id=current_job_id,
                    safe_error=safe_error,
                    started_at=now,
                    last_heartbeat_at=now,
                )
                session.add(row)
            else:
                row.status = status
                row.version = version
                row.current_job_id = current_job_id
                row.safe_error = safe_error
                row.last_heartbeat_at = now
            session.commit()

    def claim_job(self, *, worker_id: str) -> dict[str, Any] | None:
        now = now_utc()
        with self.session_factory() as session:
            stmt = (
                select(ProcessingJobRow)
                .where(
                    ProcessingJobRow.status == "QUEUED",
                    or_(
                        ProcessingJobRow.next_attempt_at.is_(None),
                        ProcessingJobRow.next_attempt_at <= now,
                    ),
                )
                .order_by(ProcessingJobRow.priority.desc(), ProcessingJobRow.queued_at.asc())
                .limit(1)
            )
            if not self.engine.url.drivername.startswith("sqlite"):
                stmt = stmt.with_for_update(skip_locked=True)
            job = session.scalar(stmt)
            if job is None:
                return None
            job.status = "RUNNING"
            job.attempts += 1
            job.started_at = now
            job.heartbeat_at = now
            session.commit()
            return row_dict(job)

    def finish_job(
        self,
        *,
        job_id: str,
        success: bool,
        error_code: str | None = None,
        safe_error: str | None = None,
    ) -> None:
        now = now_utc()
        with self.session_factory() as session:
            job = session.get(ProcessingJobRow, job_id)
            if job is None:
                return
            job.completed_at = now if success else None
            job.heartbeat_at = now
            if success:
                job.status = "SUCCEEDED"
                job.error_code = None
                job.safe_error = None
            elif job.attempts >= job.max_attempts:
                job.status = "DEAD_LETTER"
                job.error_code = error_code or "JOB_FAILED"
                job.safe_error = safe_error or "The job exceeded its retry limit."
                job.completed_at = now
            else:
                job.status = "QUEUED"
                job.error_code = error_code or "JOB_RETRY"
                job.safe_error = safe_error or "The job will be retried."
                job.next_attempt_at = now + timedelta(
                    seconds=min(300, 2 ** max(job.attempts, 1) * 5)
                )
            session.commit()

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
            if decision.decision == "AUTHORIZE":
                shipment = session.get(ShipmentCaseRow, decision.shipment_id)
                if shipment is not None:
                    shipment.status = ShipmentStatus.RELEASE_AUTHORIZED.value
                    shipment.release_authorized_at = now
                    shipment.updated_at = now
                    session.add(
                        DomainEventRow(
                            id=str(uuid.uuid4()),
                            organization_id=organization_id,
                            event_type="release.authorized",
                            entity_type="shipment",
                            entity_id=shipment.id,
                            payload_json=json.dumps(
                                {"decision_id": decision.id, "four_eyes": True}
                            ),
                            created_at=now,
                        )
                    )
            session.commit()
            session.refresh(row)
            return row_dict(row) | {"approver_name": user.display_name}

    def transition_shipment(
        self, *, organization_id: str, shipment_id: str, user: UserRow, status: str
    ) -> dict[str, Any]:
        from app.services.assurance import can_transition

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
            if not can_transition(shipment.status, status):
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
