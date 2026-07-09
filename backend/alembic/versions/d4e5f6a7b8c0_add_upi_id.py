"""add school_settings.upi_id for direct UPI fee payment

Revision ID: d4e5f6a7b8c0
Revises: c3d4e5f6a7b9
Create Date: 2026-07-09 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c0'
down_revision: Union[str, None] = 'c3d4e5f6a7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "school_settings" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        if "upi_id" not in columns:
            op.add_column("school_settings", sa.Column("upi_id", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "school_settings" in inspector.get_table_names():
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        if "upi_id" in columns:
            op.drop_column("school_settings", "upi_id")
