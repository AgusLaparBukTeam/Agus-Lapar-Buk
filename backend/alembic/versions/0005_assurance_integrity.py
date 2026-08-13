"""Complete the assurance data model and add worker heartbeat persistence."""

import sqlalchemy as sa

from alembic import op

revision = "0005_assurance_integrity"
down_revision = "0004_assurance_control_plane"
branch_labels = None
depends_on = None


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {item["name"] for item in inspector.get_columns(table)}
    if column.name not in existing:
        with op.batch_alter_table(table) as batch:
            batch.add_column(column)


def _create_if_missing(table: str, *columns: sa.Column, **kwargs: object) -> None:
    inspector = sa.inspect(op.get_bind())
    if table not in inspector.get_table_names():
        op.create_table(table, *columns, **kwargs)


def upgrade() -> None:
    _add_column_if_missing(
        "trusted_shipment_references", sa.Column("organization_id", sa.String(36))
    )
    _add_column_if_missing(
        "trusted_shipment_references",
        sa.Column("source_type", sa.String(40), server_default="MANUAL_AUTHORITATIVE_ENTRY"),
    )
    _add_column_if_missing(
        "trusted_shipment_references", sa.Column("source_record_id", sa.String(120))
    )
    _add_column_if_missing("trusted_shipment_references", sa.Column("content_hash", sa.String(64)))
    _add_column_if_missing(
        "trusted_shipment_references", sa.Column("version", sa.Integer(), server_default="1")
    )
    _add_column_if_missing(
        "trusted_shipment_references", sa.Column("expected_shipper", sa.String(160))
    )
    _add_column_if_missing("review_tasks", sa.Column("organization_id", sa.String(36)))
    _add_column_if_missing(
        "review_tasks", sa.Column("severity", sa.String(16), server_default="MEDIUM")
    )
    _add_column_if_missing("review_tasks", sa.Column("exception_id", sa.String(36)))
    _add_column_if_missing(
        "review_tasks", sa.Column("last_activity_at", sa.DateTime(timezone=True))
    )
    _add_column_if_missing("release_decisions", sa.Column("organization_id", sa.String(36)))
    _add_column_if_missing(
        "release_decisions", sa.Column("sequence", sa.Integer(), server_default="1")
    )
    _add_column_if_missing(
        "release_decisions", sa.Column("decision_snapshot_json", sa.Text(), server_default="{}")
    )
    _add_column_if_missing("release_decisions", sa.Column("evidence_hash", sa.String(64)))
    _add_column_if_missing(
        "release_decisions", sa.Column("rule_pack_versions_json", sa.Text(), server_default="[]")
    )
    _add_column_if_missing(
        "release_decisions",
        sa.Column("assurance_check_versions_json", sa.Text(), server_default="[]"),
    )
    _add_column_if_missing("release_decisions", sa.Column("supersedes_id", sa.String(36)))
    _add_column_if_missing(
        "release_decisions", sa.Column("invalidated_at", sa.DateTime(timezone=True))
    )
    _add_column_if_missing("document_requirements", sa.Column("rule_id", sa.String(80)))
    _add_column_if_missing("document_requirements", sa.Column("rule_pack_version", sa.String(40)))
    _add_column_if_missing("requirement_evaluations", sa.Column("rule_id", sa.String(80)))

    _create_if_missing(
        "trusted_reference_items",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("organization_id", sa.String(36), nullable=True),
        sa.Column("reference_id", sa.String(36), nullable=False),
        sa.Column("sku", sa.String(120), nullable=True),
        sa.Column("description", sa.String(400), nullable=True),
        sa.Column("quantity", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(24), nullable=True),
        sa.Column("unit_price", sa.Float(), nullable=True),
        sa.Column("line_total", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(
            ["reference_id"], ["trusted_shipment_references.id"], ondelete="CASCADE"
        ),
    )
    _create_if_missing(
        "screening_matches",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("organization_id", sa.String(36), nullable=False),
        sa.Column("screening_run_id", sa.String(36), nullable=False),
        sa.Column("matched_name", sa.String(200), nullable=False),
        sa.Column("matched_identifier", sa.String(120), nullable=True),
        sa.Column("dataset_record_id", sa.String(160), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("disposition", sa.String(40), nullable=False, server_default="REQUIRES_REVIEW"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["screening_run_id"], ["screening_runs.id"], ondelete="CASCADE"),
    )
    _create_if_missing(
        "worker_heartbeats",
        sa.Column("id", sa.String(36), primary_key=True, nullable=False),
        sa.Column("worker_id", sa.String(120), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("version", sa.String(40), nullable=False, server_default="unknown"),
        sa.Column("current_job_id", sa.String(36), nullable=True),
        sa.Column("safe_error", sa.String(500), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=False),
    )
    for table, column, unique in (
        ("trusted_shipment_references", "organization_id", False),
        ("review_tasks", "organization_id", False),
        ("release_decisions", "organization_id", False),
        ("screening_matches", "organization_id", False),
        ("screening_matches", "screening_run_id", False),
        ("worker_heartbeats", "worker_id", True),
    ):
        index_name = f"ix_{table}_{column}"
        inspector = sa.inspect(op.get_bind())
        existing = {item["name"] for item in inspector.get_indexes(table)}
        if index_name not in existing:
            op.create_index(index_name, table, [column], unique=unique)

    from sqlalchemy.orm import Session

    from app.repositories.operations import OrganizationRow
    from app.repositories.reconciliations import (
        ReleaseDecisionRow,
        ReviewTaskRow,
        ShipmentCaseRow,
        TrustedReferenceItemRow,
        TrustedShipmentReferenceRow,
    )

    session = Session(bind=op.get_bind())
    try:
        organization = session.scalar(
            sa.select(OrganizationRow).order_by(OrganizationRow.created_at.asc())
        )
        if organization:
            for row in session.scalars(sa.select(TrustedShipmentReferenceRow)):
                if row.organization_id is None:
                    shipment = session.get(ShipmentCaseRow, row.shipment_id)
                    row.organization_id = shipment.organization_id if shipment else organization.id
                if not row.source_type:
                    row.source_type = "MANUAL_AUTHORITATIVE_ENTRY"
                if not row.version:
                    row.version = 1
            for row in session.scalars(sa.select(TrustedReferenceItemRow)):
                if row.organization_id is None:
                    reference = session.get(TrustedShipmentReferenceRow, row.reference_id)
                    row.organization_id = (
                        reference.organization_id if reference else organization.id
                    )
            for row in session.scalars(sa.select(ReviewTaskRow)):
                if row.organization_id is None:
                    shipment = session.get(ShipmentCaseRow, row.shipment_id)
                    row.organization_id = shipment.organization_id if shipment else organization.id
                if row.last_activity_at is None:
                    row.last_activity_at = row.updated_at
            for row in session.scalars(sa.select(ReleaseDecisionRow)):
                if row.organization_id is None:
                    shipment = session.get(ShipmentCaseRow, row.shipment_id)
                    row.organization_id = shipment.organization_id if shipment else organization.id
                if not row.sequence:
                    row.sequence = 1
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    for table, index_name in (
        ("worker_heartbeats", "ix_worker_heartbeats_worker_id"),
        ("screening_matches", "ix_screening_matches_screening_run_id"),
        ("screening_matches", "ix_screening_matches_organization_id"),
        ("trusted_shipment_references", "ix_trusted_shipment_references_organization_id"),
        ("review_tasks", "ix_review_tasks_organization_id"),
        ("release_decisions", "ix_release_decisions_organization_id"),
    ):
        inspector = sa.inspect(op.get_bind())
        if index_name in {item["name"] for item in inspector.get_indexes(table)}:
            op.drop_index(index_name, table_name=table)
    inspector = sa.inspect(op.get_bind())
    if "worker_heartbeats" in inspector.get_table_names():
        op.drop_table("worker_heartbeats")
    if "screening_matches" in inspector.get_table_names():
        op.drop_table("screening_matches")
    if "trusted_reference_items" in inspector.get_table_names():
        op.drop_table("trusted_reference_items")
