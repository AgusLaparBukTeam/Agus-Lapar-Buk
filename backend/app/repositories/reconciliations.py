from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.errors import NotFoundError
from app.domain.models import OverrideEvent, OverrideRequest, ReconciliationResult


class Base(DeclarativeBase):
    pass


class ReconciliationRow(Base):
    __tablename__ = "reconciliations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    result_json: Mapped[str] = mapped_column(Text)


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
    previous_decision: Mapped[str] = mapped_column(String(16))
    final_decision: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str] = mapped_column(Text)
    corrected_fields_json: Mapped[str] = mapped_column(Text)


class ReconciliationRepository:
    def __init__(self, database_url: str, *, auto_create_schema: bool = True):
        connect_args = {}
        if database_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False, "timeout": 10}
        self.engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
        self.session_factory = sessionmaker(self.engine, expire_on_commit=False)
        if auto_create_schema:
            Base.metadata.create_all(self.engine)

    def ping(self) -> None:
        with self.session_factory() as session:
            # Verify both connectivity and that required migrations have been applied.
            session.execute(select(ReconciliationRow.id).limit(1))

    def save(self, result: ReconciliationResult) -> ReconciliationResult:
        now = datetime.now(timezone.utc)
        with self.session_factory() as session:
            row = session.get(ReconciliationRow, result.session_id)
            if row is None:
                row = ReconciliationRow(
                    id=result.session_id,
                    created_at=result.created_at,
                    updated_at=now,
                    result_json=result.model_dump_json(),
                )
                session.add(row)
            else:
                row.updated_at = now
                row.result_json = result.model_dump_json()
            session.commit()
        return result

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

    def get(self, session_id: str) -> ReconciliationResult:
        with self.session_factory() as session:
            row = session.scalar(
                select(ReconciliationRow).where(ReconciliationRow.id == session_id)
            )
            if row is None:
                raise NotFoundError("Reconciliation session was not found.")
            result = ReconciliationResult.model_validate_json(row.result_json)
            return self._hydrate_overrides(session, result)

    def override(self, session_id: str, request: OverrideRequest) -> ReconciliationResult:
        event_id = str(uuid.uuid4())
        with self.session_factory() as session:
            # Serialize overrides per reconciliation on databases that support SELECT FOR UPDATE.
            # This preserves a truthful previous_decision chain under concurrent supervisors.
            row = session.scalar(
                select(ReconciliationRow)
                .where(ReconciliationRow.id == session_id)
                .with_for_update()
            )
            if row is None:
                raise NotFoundError("Reconciliation session was not found.")

            now = datetime.now(timezone.utc)
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
                    actor=request.actor,
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
            result.audit.overridden_by = request.actor
            result.audit.override_history = []  # Canonical history lives in append-only rows.
            row.updated_at = now
            row.result_json = result.model_dump_json()
            session.commit()

        return self.get(session_id)
