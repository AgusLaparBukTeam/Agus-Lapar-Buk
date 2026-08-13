"""add document reference search

Revision ID: 0007_document_reference_search
Revises: 0006_reference_data_integrity
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_document_reference_search"
down_revision = "0006_reference_data_integrity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("shipment_documents")}
    if "document_reference" not in columns:
        op.add_column(
            "shipment_documents", sa.Column("document_reference", sa.String(160), nullable=True)
        )
    indexes = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes("shipment_documents")}
    if "ix_shipment_documents_document_reference" not in indexes:
        op.create_index(
            "ix_shipment_documents_document_reference", "shipment_documents", ["document_reference"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    indexes = {item["name"] for item in inspector.get_indexes("shipment_documents")}
    if "ix_shipment_documents_document_reference" in indexes:
        op.drop_index("ix_shipment_documents_document_reference", table_name="shipment_documents")
    columns = {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns("shipment_documents")
    }
    if "document_reference" in columns:
        op.drop_column("shipment_documents", "document_reference")
