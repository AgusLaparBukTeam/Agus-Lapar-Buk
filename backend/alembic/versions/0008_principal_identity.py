"""add explicit principal identity

Revision ID: 0008_principal_identity
Revises: 0007_document_reference_search
"""

import sqlalchemy as sa

from alembic import op

revision = "0008_principal_identity"
down_revision = "0007_document_reference_search"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    audit_columns = _columns("audit_events")
    if "actor_service_account_id" not in audit_columns:
        op.add_column(
            "audit_events",
            sa.Column("actor_service_account_id", sa.String(36), nullable=True),
        )
    if "actor_type" not in audit_columns:
        op.add_column(
            "audit_events",
            sa.Column("actor_type", sa.String(16), nullable=False, server_default="system"),
        )
    if "actor_id" not in audit_columns:
        op.add_column("audit_events", sa.Column("actor_id", sa.String(36), nullable=True))
    audit_indexes = _indexes("audit_events")
    if "ix_audit_events_actor_service_account_id" not in audit_indexes:
        op.create_index(
            "ix_audit_events_actor_service_account_id",
            "audit_events",
            ["actor_service_account_id"],
        )
    if "ix_audit_events_actor_type" not in audit_indexes:
        op.create_index("ix_audit_events_actor_type", "audit_events", ["actor_type"])
    if "ix_audit_events_actor_id" not in audit_indexes:
        op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])

    shipment_columns = _columns("shipment_cases")
    if "created_by_service_account_id" not in shipment_columns:
        op.add_column(
            "shipment_cases",
            sa.Column("created_by_service_account_id", sa.String(36), nullable=True),
        )
    if "ix_shipment_cases_created_by_service_account_id" not in _indexes("shipment_cases"):
        op.create_index(
            "ix_shipment_cases_created_by_service_account_id",
            "shipment_cases",
            ["created_by_service_account_id"],
        )
    with op.batch_alter_table("shipment_cases") as batch:
        batch.alter_column("created_by", existing_type=sa.String(36), nullable=True)


def downgrade() -> None:
    shipment_indexes = _indexes("shipment_cases")
    if "ix_shipment_cases_created_by_service_account_id" in shipment_indexes:
        op.drop_index(
            "ix_shipment_cases_created_by_service_account_id",
            table_name="shipment_cases",
        )
    if "created_by_service_account_id" in _columns("shipment_cases"):
        op.drop_column("shipment_cases", "created_by_service_account_id")
    with op.batch_alter_table("shipment_cases") as batch:
        batch.alter_column("created_by", existing_type=sa.String(36), nullable=False)

    audit_indexes = _indexes("audit_events")
    for name in (
        "ix_audit_events_actor_service_account_id",
        "ix_audit_events_actor_type",
        "ix_audit_events_actor_id",
    ):
        if name in audit_indexes:
            op.drop_index(name, table_name="audit_events")
    audit_columns = _columns("audit_events")
    for name in ("actor_id", "actor_type", "actor_service_account_id"):
        if name in audit_columns:
            op.drop_column("audit_events", name)
