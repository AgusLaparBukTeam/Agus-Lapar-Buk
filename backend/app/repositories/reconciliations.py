from __future__ import annotations

import json
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
    create_engine,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.auth.principals import Principal, ServicePrincipal
from app.core.errors import GateGuardError, NotFoundError
from app.domain.models import (
    OverrideEvent,
    OverrideRequest,
    ReconciliationResult,
    ReconciliationStatus,
    RiskLevel,
    ShipmentStatus,
    WorkQueueStatus,
)
from app.services.assurance import calculate_risk
from app.services.release_integrity import build_release_snapshot, snapshot_hash


class Base(DeclarativeBase):
    pass


class ReconciliationRow(Base):
    __tablename__ = "reconciliations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    result_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    processing_ms: Mapped[int] = mapped_column(Integer, default=0)
    shipment_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    overridden: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class OverrideRow(Base):
    """Append-only supervisor action log. Never update/delete these rows from application code."""

    __tablename__ = "reconciliation_overrides"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    reconciliation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("reconciliations.id", ondelete="RESTRICT"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    actor: Mapped[str] = mapped_column(String(120))
    actor_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    previous_decision: Mapped[str] = mapped_column(String(16))
    final_decision: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text)
    corrected_fields_json: Mapped[str] = mapped_column(Text)


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), index=True)
    active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class SessionRow(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditEventRow(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    actor_service_account_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    actor_type: Mapped[str] = mapped_column(String(16), default="system", index=True)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    actor_display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}")
    request_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class ShipmentCaseRow(Base):
    __tablename__ = "shipment_cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    facility_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    internal_reference: Mapped[str] = mapped_column(String(120), index=True)
    external_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    origin: Mapped[str] = mapped_column(String(160))
    destination: Mapped[str] = mapped_column(String(160))
    transport_mode: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(32), index=True)
    risk_level: Mapped[str] = mapped_column(String(16), index=True)
    assigned_to: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    created_by_service_account_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consignment_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    origin_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    origin_location: Mapped[str | None] = mapped_column(String(160), nullable=True)
    destination_country: Mapped[str | None] = mapped_column(String(2), nullable=True)
    destination_location: Mapped[str | None] = mapped_column(String(160), nullable=True)
    incoterm: Mapped[str | None] = mapped_column(String(16), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="MEDIUM", index=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0)
    risk_factors_json: Mapped[str] = mapped_column(Text, default="[]")
    assessment_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_assessed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    release_authorized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TrustedShipmentReferenceRow(Base):
    __tablename__ = "trusted_shipment_references"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    shipment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("shipment_cases.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )
    order_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    shipment_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    expected_recipient: Mapped[str | None] = mapped_column(String(160), nullable=True)
    expected_destination: Mapped[str | None] = mapped_column(String(160), nullable=True)
    expected_currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    expected_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_system: Mapped[str] = mapped_column(String(80))
    source_type: Mapped[str] = mapped_column(String(40), default="MANUAL_AUTHORITATIVE_ENTRY")
    source_record_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    expected_shipper: Mapped[str | None] = mapped_column(String(160), nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class TrustedReferenceItemRow(Base):
    __tablename__ = "trusted_reference_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    reference_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trusted_shipment_references.id", ondelete="CASCADE"), index=True
    )
    sku: Mapped[str | None] = mapped_column(String(120), nullable=True)
    description: Mapped[str | None] = mapped_column(String(400), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(24), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    line_total: Mapped[float | None] = mapped_column(Float, nullable=True)


class ReviewTaskRow(Base):
    __tablename__ = "review_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    shipment_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("shipment_cases.id", ondelete="CASCADE"),
        index=True,
    )
    issue: Mapped[str] = mapped_column(String(240))
    priority: Mapped[str] = mapped_column(String(16), index=True)
    stage: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(24), index=True)
    assignee: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    severity: Mapped[str] = mapped_column(String(16), default="MEDIUM", index=True)
    exception_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ReleaseDecisionRow(Base):
    __tablename__ = "release_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    shipment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("shipment_cases.id", ondelete="CASCADE"), index=True
    )
    decision: Mapped[str] = mapped_column(String(16))
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str] = mapped_column(Text)
    decision_snapshot_json: Mapped[str] = mapped_column(Text, default="{}")
    evidence_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rule_pack_versions_json: Mapped[str] = mapped_column(Text, default="[]")
    assurance_check_versions_json: Mapped[str] = mapped_column(Text, default="[]")
    decided_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    supersedes_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def user_dict(user: UserRow) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "active": user.active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "last_login_at": user.last_login_at,
        "must_change_password": user.must_change_password,
    }


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _shipment_id(result: ReconciliationResult) -> str | None:
    document = result.documents.get("delivery_order")
    value = document.shipment_id.value if document else None
    return str(value) if value is not None else None


class ReconciliationRepository:
    def __init__(self, database_url: str, *, auto_create_schema: bool = True):
        connect_args = {}
        if database_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False, "timeout": 10}
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)
        if auto_create_schema:
            # Import the extended operational models before create_all so fresh
            # installations receive the complete assurance schema in one pass.
            from app.repositories import operations as _operations  # noqa: F401

            Base.metadata.create_all(self.engine)

    def ping(self) -> None:
        with self.session_factory() as session:
            # Verify both connectivity and that required migrations have been applied.
            session.execute(select(ReconciliationRow.id).limit(1))

    def save(self, result: ReconciliationResult, *, organization_id: str) -> ReconciliationResult:
        if not organization_id:
            raise ValueError("Reconciliations require an explicit organization ID.")
        now = datetime.now(UTC)
        shipment_id = _shipment_id(result)
        with self.session_factory() as session:
            row = session.get(ReconciliationRow, result.session_id)
            if row is None:
                row = ReconciliationRow(
                    id=result.session_id,
                    created_at=result.created_at,
                    updated_at=now,
                    result_json=result.model_dump_json(),
                    status=result.status.value,
                    processing_ms=result.processing_ms,
                    organization_id=organization_id,
                    shipment_id=shipment_id,
                )
                session.add(row)
            else:
                row.updated_at = now
                row.result_json = result.model_dump_json()
                row.status = result.status.value
                row.processing_ms = result.processing_ms
                row.organization_id = organization_id
                row.shipment_id = shipment_id
            session.commit()
        return result

    def record_audit(
        self,
        event_type: str,
        entity_type: str,
        *,
        entity_id: str | None = None,
        actor: UserRow | Principal | None = None,
        organization_id: str,
        metadata: dict[str, Any] | None = None,
        request_id: str | None = None,
    ) -> None:
        if not organization_id:
            raise ValueError("Audit events require an explicit organization ID.")
        with self.session_factory() as session:
            session.add(
                AuditEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    actor_user_id=actor.id if isinstance(actor, UserRow) else None,
                    actor_service_account_id=(
                        actor.service_account_id if isinstance(actor, ServicePrincipal) else None
                    ),
                    actor_type=(
                        actor.actor_type
                        if actor is not None and hasattr(actor, "actor_type")
                        else "human"
                        if isinstance(actor, UserRow)
                        else "system"
                    ),
                    actor_id=(
                        actor.id
                        if isinstance(actor, UserRow)
                        else actor.actor_id
                        if actor is not None
                        else None
                    ),
                    actor_display_name=actor.display_name if actor else None,
                    event_type=event_type,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    metadata_json=json.dumps(metadata or {}, ensure_ascii=False, default=str),
                    request_id=request_id,
                    created_at=datetime.now(UTC),
                )
            )
            session.commit()

    def get_user_by_email(self, email: str) -> UserRow | None:
        with self.session_factory() as session:
            return session.scalar(select(UserRow).where(UserRow.email == email.strip().casefold()))

    def change_password(self, user_id: str, password_hash: str) -> UserRow:
        now = datetime.now(UTC)
        with self.session_factory() as session:
            user = session.get(UserRow, user_id)
            if user is None:
                raise NotFoundError("User was not found.")
            user.password_hash = password_hash
            user.must_change_password = False
            user.updated_at = now
            session.execute(
                update(SessionRow)
                .where(SessionRow.user_id == user_id, SessionRow.revoked_at.is_(None))
                .values(revoked_at=now)
            )
            session.commit()
            session.refresh(user)
            return user

    def get_user(self, user_id: str) -> UserRow | None:
        with self.session_factory() as session:
            return session.get(UserRow, user_id)

    def create_user(
        self,
        *,
        email: str,
        display_name: str,
        password_hash: str,
        role: str,
        organization_id: str | None = None,
    ) -> UserRow:
        now = datetime.now(UTC)
        user = UserRow(
            id=str(uuid.uuid4()),
            email=email.strip().casefold(),
            display_name=display_name.strip(),
            password_hash=password_hash,
            role=role,
            active=True,
            created_at=now,
            updated_at=now,
            must_change_password=True,
        )
        with self.session_factory() as session:
            if session.scalar(select(UserRow).where(UserRow.email == user.email)):
                raise GateGuardError(
                    "A user with this email already exists.", code="CONFLICT", status_code=409
                )
            session.add(user)
            if organization_id is not None:
                from app.repositories.operations import OrganizationRow, WorkspaceMembershipRow

                organization = session.get(OrganizationRow, organization_id)
                if organization is None or not organization.active:
                    raise NotFoundError("Workspace was not found.")
                session.add(
                    WorkspaceMembershipRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization_id,
                        user_id=user.id,
                        role=role,
                        active=True,
                        created_at=now,
                    )
                )
            session.commit()
            session.refresh(user)
            return user

    def mark_login(self, user_id: str) -> None:
        with self.session_factory() as session:
            user = session.get(UserRow, user_id)
            if user:
                user.last_login_at = user.updated_at = datetime.now(UTC)
                session.commit()

    @staticmethod
    def _shipment_dict(session: Session, row: ShipmentCaseRow) -> dict[str, Any]:
        reference = session.scalar(
            select(TrustedShipmentReferenceRow).where(
                TrustedShipmentReferenceRow.shipment_id == row.id
            )
        )
        assignee = session.get(UserRow, row.assigned_to) if row.assigned_to else None
        open_tasks = (
            session.scalar(
                select(func.count(ReviewTaskRow.id)).where(
                    ReviewTaskRow.shipment_id == row.id,
                    ReviewTaskRow.status != WorkQueueStatus.RESOLVED.value,
                )
            )
            or 0
        )
        trusted = None
        if reference:
            trusted = {
                "order_reference": reference.order_reference,
                "shipment_reference": reference.shipment_reference,
                "expected_recipient": reference.expected_recipient,
                "expected_destination": reference.expected_destination,
                "expected_currency": reference.expected_currency,
                "expected_total": reference.expected_total,
                "source_system": reference.source_system,
                "retrieved_at": reference.retrieved_at,
            }
        return {
            "id": row.id,
            "internal_reference": row.internal_reference,
            "external_reference": row.external_reference,
            "origin": row.origin,
            "destination": row.destination,
            "transport_mode": row.transport_mode,
            "status": row.status,
            "risk_level": row.risk_level,
            "assigned_to": row.assigned_to,
            "assigned_display_name": assignee.display_name if assignee else None,
            "created_by": row.created_by or row.created_by_service_account_id or "system",
            "created_at": row.created_at,
            "updated_at": row.updated_at,
            "trusted_reference": trusted,
            "open_tasks": int(open_tasks),
        }

    def create_shipment(
        self, *, organization_id: str, payload: dict[str, Any], actor: UserRow | Principal
    ) -> dict[str, Any]:
        # The legacy shipment API now writes into the same workspace boundary
        # as the operations API. Keep the lookup local to avoid an import cycle
        # while preserving compatibility for existing callers and databases.
        from app.repositories.operations import (
            AssuranceCheckRow,
            DocumentRequirementRow,
            DomainEventRow,
            FacilityRow,
            OrganizationRow,
            RequirementEvaluationRow,
            WorkspaceMembershipRow,
        )

        now = datetime.now(UTC)
        with self.session_factory() as session:
            organization = session.scalar(
                select(OrganizationRow).where(
                    OrganizationRow.id == organization_id,
                    OrganizationRow.active.is_(True),
                )
            )
            if organization is None:
                raise NotFoundError("Workspace was not found.")
            if isinstance(actor, ServicePrincipal):
                if actor.organization_id != organization_id:
                    raise GateGuardError(
                        "Service principal is not authorized for this workspace.",
                        code="FORBIDDEN",
                        status_code=403,
                    )
            else:
                membership = session.scalar(
                    select(WorkspaceMembershipRow).where(
                        WorkspaceMembershipRow.organization_id == organization_id,
                        WorkspaceMembershipRow.user_id == actor.id,
                        WorkspaceMembershipRow.active.is_(True),
                    )
                )
                if membership is None:
                    raise GateGuardError(
                        "You do not have access to this workspace.",
                        code="FORBIDDEN",
                        status_code=403,
                    )
            facility = session.scalar(
                select(FacilityRow)
                .where(FacilityRow.organization_id == organization.id, FacilityRow.active.is_(True))
                .order_by(FacilityRow.created_at.asc())
            )
            if facility is None:
                facility = FacilityRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization.id,
                    name="Primary facility",
                    code="PRIMARY",
                    timezone=organization.default_timezone,
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
                session.add(facility)
            shipment = ShipmentCaseRow(
                id=str(uuid.uuid4()),
                organization_id=organization.id,
                facility_id=facility.id,
                internal_reference=payload["internal_reference"],
                external_reference=payload.get("external_reference"),
                origin=payload["origin"],
                destination=payload["destination"],
                transport_mode=payload.get("transport_mode") or "Road",
                status=ShipmentStatus.DOCUMENTS_REQUIRED.value,
                risk_level=RiskLevel.LOW.value,
                created_by=actor.id if isinstance(actor, UserRow) else None,
                created_by_service_account_id=(
                    actor.service_account_id if isinstance(actor, ServicePrincipal) else None
                ),
                created_at=now,
                updated_at=now,
                consignment_reference=payload.get("consignment_reference"),
                origin_country=payload.get("origin_country"),
                origin_location=payload.get("origin_location"),
                destination_country=payload.get("destination_country"),
                destination_location=payload.get("destination_location"),
                incoterm=payload.get("incoterm"),
                currency=payload.get("currency") or payload.get("expected_currency"),
                priority=payload.get("priority") or "MEDIUM",
            )
            reference = TrustedShipmentReferenceRow(
                id=str(uuid.uuid4()),
                organization_id=organization.id,
                shipment_id=shipment.id,
                order_reference=payload.get("external_reference"),
                shipment_reference=payload["internal_reference"],
                expected_recipient=payload.get("expected_recipient"),
                expected_destination=payload["destination"],
                expected_currency=payload.get("expected_currency"),
                expected_total=payload.get("expected_total"),
                source_system="Workspace entry",
                source_type="MANUAL_AUTHORITATIVE_ENTRY",
                source_record_id=None,
                content_hash=None,
                version=1,
                expected_shipper=payload.get("expected_shipper"),
                retrieved_at=now,
            )
            task = ReviewTaskRow(
                id=str(uuid.uuid4()),
                organization_id=organization.id,
                shipment_id=shipment.id,
                issue="Add the shipment documents for review.",
                priority=RiskLevel.LOW.value,
                stage="Documents",
                status=WorkQueueStatus.OPEN.value,
                severity=RiskLevel.LOW.value,
                last_activity_at=now,
                created_at=now,
                updated_at=now,
            )
            requirements = list(
                session.scalars(
                    select(DocumentRequirementRow).where(
                        DocumentRequirementRow.organization_id == organization.id,
                        DocumentRequirementRow.active.is_(True),
                    )
                )
            )
            if not requirements:
                for name, document_type, reason in (
                    (
                        "Commercial invoice",
                        "COMMERCIAL_INVOICE",
                        "Confirms declared value and commercial terms.",
                    ),
                    ("Packing list", "PACKING_LIST", "Confirms items and package counts."),
                    (
                        "Delivery order",
                        "DELIVERY_ORDER",
                        "Confirms handover and destination details.",
                    ),
                ):
                    requirement = DocumentRequirementRow(
                        id=str(uuid.uuid4()),
                        organization_id=organization.id,
                        rule_pack_id=None,
                        rule_id=f"BASE-{document_type}",
                        rule_pack_version="baseline-1",
                        name=name,
                        document_type=document_type,
                        status="ACTIVE",
                        condition_json="{}",
                        reason=reason,
                        active=True,
                        created_at=now,
                    )
                    requirements.append(requirement)
                    session.add(requirement)
            evaluations = [
                RequirementEvaluationRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization.id,
                    shipment_id=shipment.id,
                    requirement_id=requirement.id,
                    rule_id=requirement.rule_id,
                    rule_pack_version="baseline-1",
                    result="PENDING",
                    reason="Required evidence has not been attached yet.",
                    evaluated_at=now,
                )
                for requirement in requirements
            ]
            session.add_all([shipment, reference, task, *evaluations])
            session.add(
                AssuranceCheckRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization.id,
                    shipment_id=shipment.id,
                    check_type="REQUIREMENTS",
                    status="REVIEW",
                    severity="MEDIUM",
                    summary="Required shipment evidence is still missing.",
                    details_json=json.dumps({"required": len(requirements), "attached": 0}),
                    source="GateGuard baseline requirements",
                    source_version="baseline-1",
                    rule_pack_version="baseline-1",
                    created_at=now,
                )
            )
            session.add(
                DomainEventRow(
                    id=str(uuid.uuid4()),
                    organization_id=organization.id,
                    event_type="shipment.created",
                    entity_type="shipment",
                    entity_id=shipment.id,
                    payload_json=json.dumps({"status": shipment.status}),
                    created_at=now,
                )
            )
            session.commit()
            session.refresh(shipment)
            return self._shipment_dict(session, shipment)

    def list_shipments(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        query: str | None = None,
        organization_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        with self.session_factory() as session:
            filters = []
            if organization_id:
                filters.append(ShipmentCaseRow.organization_id == organization_id)
            if status:
                filters.append(ShipmentCaseRow.status == status)
            if query:
                term = f"%{query.strip()}%"
                filters.append(
                    or_(
                        ShipmentCaseRow.internal_reference.ilike(term),
                        ShipmentCaseRow.external_reference.ilike(term),
                        ShipmentCaseRow.destination.ilike(term),
                    )
                )
            rows = list(
                session.scalars(
                    select(ShipmentCaseRow)
                    .where(*filters)
                    .order_by(ShipmentCaseRow.updated_at.desc())
                    .offset((page - 1) * page_size)
                    .limit(page_size)
                )
            )
            total = session.scalar(select(func.count(ShipmentCaseRow.id)).where(*filters)) or 0
            return [self._shipment_dict(session, row) for row in rows], int(total)

    def get_shipment(
        self, shipment_id: str, *, organization_id: str | None = None
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            row = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    *(
                        [ShipmentCaseRow.organization_id == organization_id]
                        if organization_id
                        else []
                    ),
                )
            )
            if row is None:
                raise NotFoundError("Shipment was not found.")
            return self._shipment_dict(session, row)

    def list_work_queue(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        priority: str | None = None,
        assignee: str | None = None,
        organization_id: str | None = None,
    ) -> tuple[list[dict[str, Any]], int]:
        with self.session_factory() as session:
            filters = []
            if organization_id:
                filters.append(ShipmentCaseRow.organization_id == organization_id)
            if status:
                filters.append(ReviewTaskRow.status == status)
            if priority:
                filters.append(ReviewTaskRow.priority == priority)
            if assignee == "unassigned":
                filters.append(ReviewTaskRow.assignee.is_(None))
            elif assignee:
                filters.append(ReviewTaskRow.assignee == assignee)
            stmt = (
                select(ReviewTaskRow, ShipmentCaseRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ReviewTaskRow.shipment_id)
                .where(*filters)
                .order_by(ReviewTaskRow.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            rows = list(session.execute(stmt))
            count_stmt = (
                select(func.count(ReviewTaskRow.id))
                .select_from(ReviewTaskRow)
                .join(ShipmentCaseRow, ShipmentCaseRow.id == ReviewTaskRow.shipment_id)
                .where(*filters)
            )
            total = session.scalar(count_stmt) or 0
            items = [
                {
                    "id": task.id,
                    "shipment_id": shipment.id,
                    "shipment_reference": shipment.internal_reference,
                    "issue": task.issue,
                    "priority": task.priority,
                    "stage": task.stage,
                    "status": task.status,
                    "assignee": (
                        session.get(UserRow, task.assignee).display_name
                        if task.assignee and session.get(UserRow, task.assignee)
                        else None
                    ),
                    "due_at": task.due_at,
                    "created_at": task.created_at,
                    "updated_at": task.updated_at,
                }
                for task, shipment in rows
            ]
            return items, int(total)

    def update_work_task(
        self, task_id: str, *, status: str, actor: UserRow, organization_id: str | None = None
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        with self.session_factory() as session:
            task = session.get(ReviewTaskRow, task_id)
            if task is None:
                raise NotFoundError("Work queue item was not found.")
            task.status = status
            task.assignee = (
                actor.id if status == WorkQueueStatus.IN_PROGRESS.value else task.assignee
            )
            task.updated_at = now
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == task.shipment_id,
                    *(
                        [ShipmentCaseRow.organization_id == organization_id]
                        if organization_id
                        else []
                    ),
                )
            )
            if shipment is None:
                raise NotFoundError("Work queue item was not found in this workspace.")
            if shipment:
                remaining = (
                    session.scalar(
                        select(func.count(ReviewTaskRow.id)).where(
                            ReviewTaskRow.shipment_id == shipment.id,
                            ReviewTaskRow.status != WorkQueueStatus.RESOLVED.value,
                        )
                    )
                    or 0
                )
                if remaining == 0 and shipment.status in {
                    ShipmentStatus.DOCUMENTS_REQUIRED.value,
                    ShipmentStatus.REVIEW_REQUIRED.value,
                }:
                    shipment.status = ShipmentStatus.REVIEW_REQUIRED.value
                shipment.updated_at = now
            session.commit()
            return {
                "id": task.id,
                "shipment_id": task.shipment_id,
                "shipment_reference": shipment.internal_reference if shipment else task.shipment_id,
                "issue": task.issue,
                "priority": task.priority,
                "stage": task.stage,
                "status": task.status,
                "assignee": actor.display_name if task.assignee == actor.id else None,
                "due_at": task.due_at,
                "created_at": task.created_at,
                "updated_at": task.updated_at,
            }

    def decide_release(
        self,
        shipment_id: str,
        *,
        decision: str,
        reason: str,
        actor: UserRow,
        organization_id: str | None = None,
    ) -> tuple[dict[str, Any], datetime]:
        from app.repositories.operations import (
            AssuranceCheckRow,
            DocumentRequirementRow,
            DomainEventRow,
            RequirementEvaluationRow,
            ShipmentExceptionRow,
            TrustedShipmentReferenceRow,
        )

        now = datetime.now(UTC)
        with self.session_factory() as session:
            shipment = session.scalar(
                select(ShipmentCaseRow).where(
                    ShipmentCaseRow.id == shipment_id,
                    *(
                        [ShipmentCaseRow.organization_id == organization_id]
                        if organization_id
                        else []
                    ),
                )
            )
            if shipment is None:
                raise NotFoundError("Shipment was not found.")
            if decision not in {"AUTHORIZE", "HOLD", "REVIEW_REQUIRED"}:
                raise GateGuardError(
                    "Release decision is invalid.", code="VALIDATION_ERROR", status_code=422
                )
            open_tasks = (
                session.scalar(
                    select(func.count(ReviewTaskRow.id)).where(
                        ReviewTaskRow.shipment_id == shipment_id,
                        ReviewTaskRow.status != WorkQueueStatus.RESOLVED.value,
                    )
                )
                or 0
            )
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
            missing_requirements = [
                requirement.name
                for evaluation, requirement in evaluations
                if requirement.status in {"REQUIRED", "ACTIVE"}
                and evaluation.result not in {"PROVIDED", "CLEAR", "NOT_APPLICABLE"}
            ]
            latest_checks: dict[str, AssuranceCheckRow] = {}
            for check in session.scalars(
                select(AssuranceCheckRow)
                .where(AssuranceCheckRow.shipment_id == shipment_id)
                .order_by(AssuranceCheckRow.created_at.desc())
            ):
                latest_checks.setdefault(check.check_type, check)
            blocking_checks = [
                check.check_type
                for check in latest_checks.values()
                if check.status in {"HOLD", "REVIEW", "PENDING", "RUNNING", "FAILED"}
            ]
            open_exceptions = list(
                session.scalars(
                    select(ShipmentExceptionRow).where(
                        ShipmentExceptionRow.shipment_id == shipment_id,
                        ShipmentExceptionRow.status.not_in(["RESOLVED", "CANCELLED"]),
                    )
                )
            )
            blocking_exceptions = [
                item.summary for item in open_exceptions if item.severity in {"HIGH", "CRITICAL"}
            ]
            if decision == "AUTHORIZE" and (
                open_tasks or missing_requirements or blocking_checks or blocking_exceptions
            ):
                raise GateGuardError(
                    "Release is blocked until required evidence, assurance checks, and "
                    "blocking exceptions are clear.",
                    code="REVIEW_REQUIRED",
                    status_code=409,
                )
            trusted_reference = session.scalar(
                select(TrustedShipmentReferenceRow).where(
                    TrustedShipmentReferenceRow.shipment_id == shipment_id,
                    TrustedShipmentReferenceRow.organization_id == organization_id,
                )
            )
            snapshot = build_release_snapshot(
                missing_requirements=missing_requirements,
                blocking_checks=blocking_checks,
                blocking_exceptions=blocking_exceptions,
                open_tasks=int(open_tasks),
                trusted_reference_version=(
                    trusted_reference.version if trusted_reference is not None else None
                ),
                trusted_reference_hash=(
                    trusted_reference.content_hash if trusted_reference is not None else None
                ),
                assurance_versions={
                    check_type: (check.status, check.source_version)
                    for check_type, check in latest_checks.items()
                },
            )
            risk = calculate_risk(
                [("BLOCKING_ASSURANCE", item) for item in blocking_checks]
                + [("HIGH_CRITICAL_EXCEPTION", item) for item in blocking_exceptions]
                + [("MISSING_REQUIRED_DOCUMENT", item) for item in missing_requirements]
            )
            shipment.status = (
                ShipmentStatus.RELEASE_PENDING_APPROVAL.value
                if decision == "AUTHORIZE"
                else ShipmentStatus.HOLD.value
            )
            shipment.risk_level = (
                risk.level.value if decision == "AUTHORIZE" else RiskLevel.HIGH.value
            )
            shipment.risk_score = risk.score
            shipment.risk_factors_json = json.dumps(risk.factors)
            sequence = (
                session.scalar(
                    select(func.max(ReleaseDecisionRow.sequence)).where(
                        ReleaseDecisionRow.shipment_id == shipment_id
                    )
                )
                or 0
            ) + 1
            evidence_hash = snapshot_hash(snapshot)
            shipment.updated_at = now
            session.add(
                ReleaseDecisionRow(
                    id=str(uuid.uuid4()),
                    organization_id=shipment.organization_id,
                    shipment_id=shipment_id,
                    decision=decision,
                    sequence=sequence,
                    reason=reason,
                    decision_snapshot_json=json.dumps(snapshot),
                    evidence_hash=evidence_hash,
                    rule_pack_versions_json=json.dumps(["baseline-1"]),
                    assurance_check_versions_json=json.dumps(
                        [check.source_version for check in latest_checks.values()]
                    ),
                    decided_by=actor.id,
                    created_at=now,
                )
            )
            if decision == "HOLD":
                session.add(
                    ReviewTaskRow(
                        id=str(uuid.uuid4()),
                        organization_id=shipment.organization_id,
                        shipment_id=shipment_id,
                        issue=reason,
                        priority=RiskLevel.HIGH.value,
                        stage="Release decision",
                        status=WorkQueueStatus.OPEN.value,
                        severity=RiskLevel.HIGH.value,
                        last_activity_at=now,
                        created_at=now,
                        updated_at=now,
                    )
                )
            if shipment.organization_id:
                session.add(
                    DomainEventRow(
                        id=str(uuid.uuid4()),
                        organization_id=shipment.organization_id,
                        event_type="release.decision.recorded",
                        entity_type="shipment",
                        entity_id=shipment_id,
                        payload_json=json.dumps({"decision": decision}),
                        created_at=now,
                    )
                )
            session.commit()
            return self._shipment_dict(session, shipment), now

    def create_session(self, *, token_hash: str, user_id: str, expires_at: datetime) -> None:
        now = datetime.now(UTC)
        with self.session_factory() as session:
            session.add(
                SessionRow(
                    token_hash=token_hash,
                    user_id=user_id,
                    created_at=now,
                    expires_at=expires_at,
                    last_seen_at=now,
                )
            )
            session.commit()

    def get_session_user(self, token_hash: str) -> UserRow | None:
        now = datetime.now(UTC)
        with self.session_factory() as session:
            row = session.scalar(select(SessionRow).where(SessionRow.token_hash == token_hash))
            if row is None or row.revoked_at is not None or as_utc(row.expires_at) <= now:
                return None
            user = session.get(UserRow, row.user_id)
            if user is None or not user.active:
                return None
            row.last_seen_at = now
            session.commit()
            return user

    def revoke_session(self, token_hash: str) -> UserRow | None:
        with self.session_factory() as session:
            row = session.scalar(select(SessionRow).where(SessionRow.token_hash == token_hash))
            user = session.get(UserRow, row.user_id) if row else None
            if row and row.revoked_at is None:
                row.revoked_at = datetime.now(UTC)
                session.commit()
            return user

    def list_users(self, *, organization_id: str) -> list[UserRow]:
        from app.repositories.operations import WorkspaceMembershipRow

        with self.session_factory() as session:
            return list(
                session.scalars(
                    select(UserRow)
                    .join(WorkspaceMembershipRow, WorkspaceMembershipRow.user_id == UserRow.id)
                    .where(
                        WorkspaceMembershipRow.organization_id == organization_id,
                        WorkspaceMembershipRow.active.is_(True),
                    )
                    .order_by(UserRow.created_at.desc())
                )
            )

    def update_user(
        self,
        user_id: str,
        *,
        organization_id: str,
        role: str | None = None,
        active: bool | None = None,
    ) -> UserRow:
        from app.repositories.operations import WorkspaceMembershipRow

        with self.session_factory() as session:
            membership = session.scalar(
                select(WorkspaceMembershipRow).where(
                    WorkspaceMembershipRow.organization_id == organization_id,
                    WorkspaceMembershipRow.user_id == user_id,
                )
            )
            user = session.get(UserRow, user_id)
            if user is None or membership is None:
                raise NotFoundError("User was not found in this workspace.")
            if (active is False or (role and role != "admin")) and membership.role == "admin":
                active_admins = (
                    session.scalar(
                        select(func.count(WorkspaceMembershipRow.id)).where(
                            WorkspaceMembershipRow.organization_id == organization_id,
                            WorkspaceMembershipRow.role == "admin",
                            WorkspaceMembershipRow.active.is_(True),
                        )
                    )
                    or 0
                )
                if active_admins <= 1:
                    raise GateGuardError(
                        "The final active admin cannot lose workspace access.",
                        code="CONFLICT",
                        status_code=409,
                    )
            if role is not None:
                membership.role = role
            if active is not None:
                membership.active = active
            user.updated_at = datetime.now(UTC)
            session.commit()
            session.refresh(user)
            return user

    def list_reconciliations(
        self,
        *,
        page: int,
        page_size: int,
        status: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        overridden: bool | None = None,
        query: str | None = None,
        organization_id: str | None = None,
    ) -> tuple[list[ReconciliationResult], int]:
        with self.session_factory() as session:
            filters = []
            if organization_id:
                filters.append(ReconciliationRow.organization_id == organization_id)
            if status:
                filters.append(
                    or_(
                        ReconciliationRow.status == status,
                        ReconciliationRow.result_json.contains(f'"status":"{status}"'),
                    )
                )
            if date_from:
                filters.append(ReconciliationRow.created_at >= date_from)
            if date_to:
                filters.append(ReconciliationRow.created_at < date_to)
            if query:
                term = f"%{query.strip()}%"
                filters.append(
                    or_(ReconciliationRow.result_json.like(term), ReconciliationRow.id.like(term))
                )
            if overridden is True:
                filters.append(
                    or_(
                        ReconciliationRow.overridden.is_(True),
                        ReconciliationRow.id.in_(select(OverrideRow.reconciliation_id).distinct()),
                    )
                )
            elif overridden is False:
                filters.append(ReconciliationRow.overridden.is_(False))
            stmt = (
                select(ReconciliationRow)
                .where(*filters)
                .order_by(ReconciliationRow.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            rows = list(session.scalars(stmt))
            total = session.scalar(select(func.count(ReconciliationRow.id)).where(*filters)) or 0
            results = [
                self._hydrate_overrides(
                    session, ReconciliationResult.model_validate_json(row.result_json)
                )
                for row in rows
            ]
            return results, int(total)

    def dashboard(
        self, start: datetime, end: datetime, *, organization_id: str | None = None
    ) -> dict[str, Any]:
        with self.session_factory() as session:
            filters = [
                ReconciliationRow.created_at >= start,
                ReconciliationRow.created_at < end,
            ]
            if organization_id:
                filters.append(ReconciliationRow.organization_id == organization_id)
            rows = list(
                session.scalars(
                    select(ReconciliationRow)
                    .where(*filters)
                    .order_by(ReconciliationRow.created_at.desc())
                )
            )
            results = [
                self._hydrate_overrides(
                    session, ReconciliationResult.model_validate_json(row.result_json)
                )
                for row in rows
            ]
            counts = {
                status: sum(r.effective_status == status for r in results)
                for status in ReconciliationStatus
            }
            awaiting = sum(
                r.effective_status in {ReconciliationStatus.REVIEW, ReconciliationStatus.HOLD}
                and not r.audit.override_history
                for r in results
            )
            processing = [r.processing_ms for r in results]
            protected_value = sum(result.estimated_discrepancy_total for result in results)
            return {
                "reconciliations_today": len(results),
                "clear_today": counts[ReconciliationStatus.CLEAR],
                "review_today": counts[ReconciliationStatus.REVIEW],
                "hold_today": counts[ReconciliationStatus.HOLD],
                "awaiting_review": awaiting,
                "overridden": sum(bool(r.audit.override_history) for r in results),
                "average_processing_ms": sum(processing) / len(processing) if processing else 0,
                "total_discrepancy_prevented": round(protected_value, 2),
                "recent": results[:8],
            }

    def list_audit(
        self, limit: int = 100, *, organization_id: str | None = None
    ) -> list[AuditEventRow]:
        with self.session_factory() as session:
            filters = [AuditEventRow.organization_id == organization_id] if organization_id else []
            return list(
                session.scalars(
                    select(AuditEventRow)
                    .where(*filters)
                    .order_by(AuditEventRow.created_at.desc())
                    .limit(limit)
                )
            )

    @staticmethod
    def _event_model(event: OverrideRow) -> OverrideEvent:
        return OverrideEvent(
            id=event.id,
            actor=event.actor,
            previous_decision=event.previous_decision,
            final_decision=event.final_decision,
            reason=event.reason,
            corrected_fields=json.loads(event.corrected_fields_json),
            created_at=event.created_at,
        )

    def _hydrate_overrides(
        self,
        session: Session,
        result: ReconciliationResult,
    ) -> ReconciliationResult:
        rows = list(
            session.scalars(
                select(OverrideRow)
                .where(OverrideRow.reconciliation_id == result.session_id)
                .order_by(OverrideRow.created_at.asc(), OverrideRow.id.asc())
            )
        )
        history = [self._event_model(row) for row in rows]
        result.audit.override_history = history
        if history:
            latest = history[-1]
            result.audit.final_decision = latest.final_decision
            result.audit.override_reason = latest.reason
            result.audit.corrected_fields = latest.corrected_fields
            result.audit.overridden_at = latest.created_at
            result.audit.overridden_by = latest.actor
        return result

    def get(self, session_id: str, *, organization_id: str | None = None) -> ReconciliationResult:
        with self.session_factory() as session:
            row = session.scalar(
                select(ReconciliationRow).where(
                    ReconciliationRow.id == session_id,
                    *(
                        [ReconciliationRow.organization_id == organization_id]
                        if organization_id
                        else []
                    ),
                )
            )
            if row is None:
                raise NotFoundError("Reconciliation session was not found.")
            result = ReconciliationResult.model_validate_json(row.result_json)
            return self._hydrate_overrides(session, result)

    def override(
        self,
        session_id: str,
        request: OverrideRequest,
        actor_user: UserRow | None = None,
        request_id: str | None = None,
        organization_id: str | None = None,
    ) -> ReconciliationResult:
        event_id = str(uuid.uuid4())
        with self.session_factory() as session:
            # Serialize overrides per reconciliation on databases that support SELECT FOR UPDATE.
            # This preserves a truthful previous_decision chain under concurrent supervisors.
            row = session.scalar(
                select(ReconciliationRow)
                .where(
                    ReconciliationRow.id == session_id,
                    *(
                        [ReconciliationRow.organization_id == organization_id]
                        if organization_id
                        else []
                    ),
                )
                .with_for_update()
            )
            if row is None:
                raise NotFoundError("Reconciliation session was not found.")
            resolved_organization_id = organization_id or row.organization_id
            if not resolved_organization_id:
                raise ValueError("Reconciliation overrides require an organization ID.")

            now = datetime.now(UTC)
            result = ReconciliationResult.model_validate_json(row.result_json)
            # Determine the previous operational decision from immutable history when present.
            latest = session.scalar(
                select(OverrideRow)
                .where(OverrideRow.reconciliation_id == session_id)
                .order_by(OverrideRow.created_at.desc(), OverrideRow.id.desc())
                .limit(1)
            )
            previous = latest.final_decision if latest else result.audit.system_decision.value

            session.add(
                OverrideRow(
                    id=event_id,
                    reconciliation_id=session_id,
                    created_at=now,
                    actor=actor_user.display_name if actor_user else (request.actor or "legacy"),
                    actor_user_id=actor_user.id if actor_user else None,
                    previous_decision=str(previous),
                    final_decision=request.final_decision.value,
                    reason=request.reason.strip(),
                    corrected_fields_json=json.dumps(
                        request.corrected_fields,
                        ensure_ascii=False,
                        separators=(",", ":"),
                        default=str,
                    ),
                )
            )

            # Cache the latest state in the reconciliation blob for compatibility/read speed.
            result.audit.final_decision = request.final_decision
            result.audit.override_reason = request.reason.strip()
            result.audit.corrected_fields = request.corrected_fields
            result.audit.overridden_at = now
            result.audit.overridden_by = (
                actor_user.display_name if actor_user else (request.actor or "legacy")
            )
            result.audit.override_history = []  # Canonical history lives in append-only rows.
            row.updated_at = now
            row.result_json = result.model_dump_json()
            row.overridden = True
            session.commit()

        self.record_audit(
            "reconciliation.override",
            "reconciliation",
            entity_id=session_id,
            actor=actor_user,
            metadata={
                "previous_decision": str(previous),
                "final_decision": request.final_decision.value,
            },
            organization_id=resolved_organization_id,
            request_id=request_id,
        )

        return self.get(session_id, organization_id=resolved_organization_id)
