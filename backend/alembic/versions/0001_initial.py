"""Create reconciliation and append-only override tables.

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-09
"""

import sqlalchemy as sa

from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reconciliations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "reconciliation_overrides",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("reconciliation_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("previous_decision", sa.String(length=16), nullable=False),
        sa.Column("final_decision", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("corrected_fields_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["reconciliation_id"], ["reconciliations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_reconciliation_overrides_reconciliation_id"),
        "reconciliation_overrides",
        ["reconciliation_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_reconciliation_overrides_created_at"),
        "reconciliation_overrides",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_reconciliation_overrides_created_at"),
        table_name="reconciliation_overrides",
    )
    op.drop_index(
        op.f("ix_reconciliation_overrides_reconciliation_id"),
        table_name="reconciliation_overrides",
    )
    op.drop_table("reconciliation_overrides")
    op.drop_table("reconciliations")
