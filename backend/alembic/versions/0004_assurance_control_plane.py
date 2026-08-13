"""Add the organization-scoped shipment assurance control plane."""

from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa

from alembic import op

revision = "0004_assurance_control_plane"
down_revision = "0003_shipment_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()
            )
        )

    with op.batch_alter_table("audit_events") as batch:
        batch.add_column(sa.Column("organization_id", sa.String(length=36), nullable=True))
    op.create_index("ix_audit_events_organization_id", "audit_events", ["organization_id"])

    with op.batch_alter_table("reconciliations") as batch:
        batch.add_column(sa.Column("organization_id", sa.String(length=36), nullable=True))
    op.create_index("ix_reconciliations_organization_id", "reconciliations", ["organization_id"])

    shipment_columns = [
        ("organization_id", sa.String(length=36)),
        ("facility_id", sa.String(length=36)),
        ("consignment_reference", sa.String(length=120)),
        ("origin_country", sa.String(length=2)),
        ("origin_location", sa.String(length=160)),
        ("destination_country", sa.String(length=2)),
        ("destination_location", sa.String(length=160)),
        ("incoterm", sa.String(length=16)),
        ("currency", sa.String(length=8)),
        ("priority", sa.String(length=16), "MEDIUM"),
        ("risk_score", sa.Float(), "0"),
        ("risk_factors_json", sa.Text(), "[]"),
        ("assessment_started_at", sa.DateTime(timezone=True)),
        ("last_assessed_at", sa.DateTime(timezone=True)),
        ("release_authorized_at", sa.DateTime(timezone=True)),
        ("dispatched_at", sa.DateTime(timezone=True)),
        ("closed_at", sa.DateTime(timezone=True)),
    ]
    with op.batch_alter_table("shipment_cases") as batch:
        for item in shipment_columns:
            name, column, *default = item
            batch.add_column(
                sa.Column(
                    name, column, nullable=True, server_default=default[0] if default else None
                )
            )
    op.create_index("ix_shipment_cases_organization_id", "shipment_cases", ["organization_id"])
    op.create_index("ix_shipment_cases_facility_id", "shipment_cases", ["facility_id"])

    # Importing the ORM module registers all new operational tables on the
    # existing Base. create_all is safe here because it only creates missing
    # tables; the explicit column changes above handle legacy tables.
    import app.repositories.operations as _operations  # noqa: F401
    from app.repositories.operations import Base

    Base.metadata.create_all(bind=bind)

    from sqlalchemy.orm import Session

    from app.repositories.operations import FacilityRow, OrganizationRow, WorkspaceMembershipRow
    from app.repositories.reconciliations import ShipmentCaseRow, UserRow

    session = Session(bind=bind)
    try:
        now = datetime.now(UTC)
        organization = session.scalar(
            sa.select(OrganizationRow).order_by(OrganizationRow.created_at.asc())
        )
        if organization is None:
            organization = OrganizationRow(
                id=str(uuid4()),
                name="GateGuard Operations",
                code="DEFAULT",
                default_timezone="UTC",
                default_locale="en-GB",
                default_currency="USD",
                active=True,
                created_at=now,
                updated_at=now,
            )
            session.add(organization)
            session.flush()
            session.add(
                FacilityRow(
                    id=str(uuid4()),
                    organization_id=organization.id,
                    name="Primary facility",
                    code="PRIMARY",
                    country_code=None,
                    location=None,
                    timezone="UTC",
                    active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
        for user in session.scalars(sa.select(UserRow)):
            membership = session.scalar(
                sa.select(WorkspaceMembershipRow).where(
                    WorkspaceMembershipRow.organization_id == organization.id,
                    WorkspaceMembershipRow.user_id == user.id,
                )
            )
            if membership is None:
                session.add(
                    WorkspaceMembershipRow(
                        id=str(uuid4()),
                        organization_id=organization.id,
                        user_id=user.id,
                        role=user.role,
                        active=True,
                        created_at=now,
                    )
                )
        session.execute(
            sa.update(ShipmentCaseRow)
            .where(ShipmentCaseRow.organization_id.is_(None))
            .values(organization_id=organization.id)
        )
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    # New tables are intentionally left to Alembic's table list in production;
    # dropping the control plane would destroy operational history. Legacy
    # columns can still be removed safely when a rollback is explicitly needed.
    op.drop_index("ix_shipment_cases_facility_id", table_name="shipment_cases")
    op.drop_index("ix_shipment_cases_organization_id", table_name="shipment_cases")
    with op.batch_alter_table("shipment_cases") as batch:
        for name in (
            "closed_at",
            "dispatched_at",
            "release_authorized_at",
            "last_assessed_at",
            "assessment_started_at",
            "risk_factors_json",
            "risk_score",
            "priority",
            "currency",
            "incoterm",
            "destination_location",
            "destination_country",
            "origin_location",
            "origin_country",
            "consignment_reference",
            "facility_id",
            "organization_id",
        ):
            batch.drop_column(name)
    with op.batch_alter_table("users") as batch:
        batch.drop_column("must_change_password")
    op.drop_index("ix_audit_events_organization_id", table_name="audit_events")
    with op.batch_alter_table("audit_events") as batch:
        batch.drop_column("organization_id")
    op.drop_index("ix_reconciliations_organization_id", table_name="reconciliations")
    with op.batch_alter_table("reconciliations") as batch:
        batch.drop_column("organization_id")
