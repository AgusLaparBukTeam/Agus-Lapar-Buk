"""Add shipment assurance, trusted references, and review work queue."""

import sqlalchemy as sa

from alembic import op

revision = "0003_shipment_operations"
down_revision = "0002_auth_and_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shipment_cases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("internal_reference", sa.String(length=120), nullable=False),
        sa.Column("external_reference", sa.String(length=120), nullable=True),
        sa.Column("origin", sa.String(length=160), nullable=False),
        sa.Column("destination", sa.String(length=160), nullable=False),
        sa.Column("transport_mode", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("assigned_to", sa.String(length=36), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_shipment_cases_internal_reference", "shipment_cases", ["internal_reference"]
    )
    op.create_index("ix_shipment_cases_status", "shipment_cases", ["status"])
    op.create_index("ix_shipment_cases_risk_level", "shipment_cases", ["risk_level"])
    op.create_index("ix_shipment_cases_assigned_to", "shipment_cases", ["assigned_to"])
    op.create_index("ix_shipment_cases_created_at", "shipment_cases", ["created_at"])

    op.create_table(
        "trusted_shipment_references",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("shipment_id", sa.String(length=36), nullable=False),
        sa.Column("order_reference", sa.String(length=120), nullable=True),
        sa.Column("shipment_reference", sa.String(length=120), nullable=True),
        sa.Column("expected_recipient", sa.String(length=160), nullable=True),
        sa.Column("expected_destination", sa.String(length=160), nullable=True),
        sa.Column("expected_currency", sa.String(length=8), nullable=True),
        sa.Column("expected_total", sa.Float(), nullable=True),
        sa.Column("source_system", sa.String(length=80), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipment_cases.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shipment_id"),
    )
    op.create_index(
        "ix_trusted_shipment_references_shipment_id",
        "trusted_shipment_references",
        ["shipment_id"],
        unique=True,
    )

    op.create_table(
        "review_tasks",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("shipment_id", sa.String(length=36), nullable=False),
        sa.Column("issue", sa.String(length=240), nullable=False),
        sa.Column("priority", sa.String(length=16), nullable=False),
        sa.Column("stage", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("assignee", sa.String(length=36), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipment_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignee"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_review_tasks_shipment_id", "review_tasks", ["shipment_id"])
    op.create_index("ix_review_tasks_status", "review_tasks", ["status"])
    op.create_index("ix_review_tasks_priority", "review_tasks", ["priority"])
    op.create_index("ix_review_tasks_assignee", "review_tasks", ["assignee"])

    op.create_table(
        "release_decisions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("shipment_id", sa.String(length=36), nullable=False),
        sa.Column("decision", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("decided_by", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipment_cases.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["decided_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_release_decisions_shipment_id", "release_decisions", ["shipment_id"])
    op.create_index("ix_release_decisions_created_at", "release_decisions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_release_decisions_created_at", table_name="release_decisions")
    op.drop_index("ix_release_decisions_shipment_id", table_name="release_decisions")
    op.drop_table("release_decisions")
    op.drop_index("ix_review_tasks_assignee", table_name="review_tasks")
    op.drop_index("ix_review_tasks_priority", table_name="review_tasks")
    op.drop_index("ix_review_tasks_status", table_name="review_tasks")
    op.drop_index("ix_review_tasks_shipment_id", table_name="review_tasks")
    op.drop_table("review_tasks")
    op.drop_index(
        "ix_trusted_shipment_references_shipment_id", table_name="trusted_shipment_references"
    )
    op.drop_table("trusted_shipment_references")
    op.drop_index("ix_shipment_cases_created_at", table_name="shipment_cases")
    op.drop_index("ix_shipment_cases_assigned_to", table_name="shipment_cases")
    op.drop_index("ix_shipment_cases_risk_level", table_name="shipment_cases")
    op.drop_index("ix_shipment_cases_status", table_name="shipment_cases")
    op.drop_index("ix_shipment_cases_internal_reference", table_name="shipment_cases")
    op.drop_table("shipment_cases")
