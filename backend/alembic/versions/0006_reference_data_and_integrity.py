"""Persist workspace reference data and keep the assurance schema explicit."""

import sqlalchemy as sa

from alembic import op

revision = "0006_reference_data_integrity"
down_revision = "0005_assurance_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "reference_data" not in inspector.get_table_names():
        op.create_table(
            "reference_data",
            sa.Column("id", sa.String(36), primary_key=True, nullable=False),
            sa.Column("organization_id", sa.String(36), nullable=False),
            sa.Column("category", sa.String(40), nullable=False),
            sa.Column("code", sa.String(80), nullable=False),
            sa.Column("label", sa.String(200), nullable=False),
            sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("source", sa.String(160), nullable=False),
            sa.Column("version", sa.String(40), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        )
    indexes = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes("reference_data")}
    for name, column in (
        ("ix_reference_data_organization_id", "organization_id"),
        ("ix_reference_data_category", "category"),
        ("ix_reference_data_code", "code"),
        ("ix_reference_data_active", "active"),
    ):
        if name not in indexes:
            op.create_index(name, "reference_data", [column])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "reference_data" in inspector.get_table_names():
        op.drop_table("reference_data")
