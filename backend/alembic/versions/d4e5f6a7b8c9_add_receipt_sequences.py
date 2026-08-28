"""add receipt_sequences table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "receipt_sequences" in inspector.get_table_names():
        return

    op.create_table(
        "receipt_sequences",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("financial_year", sa.String(), nullable=False),
        sa.Column("last_number", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_receipt_sequences_financial_year", "receipt_sequences", ["financial_year"], unique=True
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "receipt_sequences" not in inspector.get_table_names():
        return
    op.drop_table("receipt_sequences")
