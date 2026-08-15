"""persist normalized document extraction result

Revision ID: 0009_document_extraction_result
Revises: 0008_principal_identity
"""

import sqlalchemy as sa

from alembic import op

revision = "0009_document_extraction_result"
down_revision = "0008_principal_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("document_versions")
    }
    if "extraction_result_json" not in columns:
        op.add_column(
            "document_versions",
            sa.Column("extraction_result_json", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("document_versions")
    }
    if "extraction_result_json" in columns:
        op.drop_column("document_versions", "extraction_result_json")
