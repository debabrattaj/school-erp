"""add relative due-date days to scheduled fee structures

Revision ID: c2d3e4f5a6b7
Revises: b019aa202609
Create Date: 2026-10-03 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b019aa202609"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fee_structures" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("fee_structures")}
    if "due_days_after_generation" not in columns:
        op.add_column(
            "fee_structures",
            sa.Column("due_days_after_generation", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "fee_structures" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("fee_structures")}
    if "due_days_after_generation" in columns:
        op.drop_column("fee_structures", "due_days_after_generation")
