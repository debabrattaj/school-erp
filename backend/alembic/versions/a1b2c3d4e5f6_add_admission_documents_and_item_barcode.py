"""add admission documents and inventory item barcode

Revision ID: a1b2c3d4e5f6
Revises: f4a5b6c7d8e9
Create Date: 2026-08-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f4a5b6c7d8e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "admission_documents" not in tables:
        op.create_table(
            "admission_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("inquiry_id", sa.Integer(), sa.ForeignKey("admission_inquiries.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(), nullable=False),
            sa.Column("file_name", sa.String(), nullable=True),
            sa.Column("file_url", sa.String(), nullable=False),
            sa.Column("uploaded_by", sa.String(), nullable=True),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_admission_documents_inquiry_id", "admission_documents", ["inquiry_id"])
        op.create_index("ix_admission_documents_document_type", "admission_documents", ["document_type"])

    item_cols = {c["name"] for c in inspector.get_columns("inventory_items")}
    if "barcode" not in item_cols:
        with op.batch_alter_table("inventory_items", schema=None) as batch_op:
            batch_op.add_column(sa.Column("barcode", sa.String(), nullable=True))
        op.create_index("ix_inventory_items_barcode", "inventory_items", ["barcode"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_inventory_items_barcode", table_name="inventory_items")
    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.drop_column("barcode")

    op.drop_table("admission_documents")
