"""Add human authentication, operational indexes, and audit events."""

import sqlalchemy as sa

from alembic import op

revision = "0002_auth_and_operations"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_role", "users", ["role"])
    op.create_index("ix_users_active", "users", ["active"])
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_hash"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("actor_user_id", sa.String(length=36), nullable=True),
        sa.Column("actor_display_name", sa.String(length=120), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=80), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=False),
        sa.Column("request_id", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    for name, column in (
        ("actor_user_id", "actor_user_id"),
        ("event_type", "event_type"),
        ("entity_type", "entity_type"),
        ("entity_id", "entity_id"),
        ("request_id", "request_id"),
        ("created_at", "created_at"),
    ):
        op.create_index(f"ix_audit_events_{name}", "audit_events", [column])
    with op.batch_alter_table("reconciliation_overrides") as batch:
        batch.add_column(sa.Column("actor_user_id", sa.String(length=36), nullable=True))
        batch.create_foreign_key("fk_override_actor_user", "users", ["actor_user_id"], ["id"])
    op.create_index("ix_reconciliations_created_at", "reconciliations", ["created_at"])
    with op.batch_alter_table("reconciliations") as batch:
        batch.add_column(sa.Column("status", sa.String(length=16), nullable=True))
        batch.add_column(
            sa.Column("processing_ms", sa.Integer(), nullable=False, server_default="0")
        )
        batch.add_column(sa.Column("shipment_id", sa.String(length=120), nullable=True))
        batch.add_column(
            sa.Column("overridden", sa.Boolean(), nullable=False, server_default=sa.false())
        )
    op.create_index("ix_reconciliations_status", "reconciliations", ["status"])
    op.create_index("ix_reconciliations_shipment_id", "reconciliations", ["shipment_id"])
    op.create_index("ix_reconciliations_overridden", "reconciliations", ["overridden"])


def downgrade() -> None:
    op.drop_index("ix_reconciliations_overridden", table_name="reconciliations")
    op.drop_index("ix_reconciliations_shipment_id", table_name="reconciliations")
    op.drop_index("ix_reconciliations_status", table_name="reconciliations")
    with op.batch_alter_table("reconciliations") as batch:
        batch.drop_column("overridden")
        batch.drop_column("shipment_id")
        batch.drop_column("processing_ms")
        batch.drop_column("status")
    op.drop_index("ix_reconciliations_created_at", table_name="reconciliations")
    with op.batch_alter_table("reconciliation_overrides") as batch:
        batch.drop_constraint("fk_override_actor_user", type_="foreignkey")
        batch.drop_column("actor_user_id")
    for name in (
        "created_at",
        "request_id",
        "entity_id",
        "entity_type",
        "event_type",
        "actor_user_id",
    ):
        op.drop_index(f"ix_audit_events_{name}", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_users_active", table_name="users")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
