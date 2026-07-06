"""add timetable entry_type and label

Revision ID: d1a2b3c4e5f6
Revises: c43412d527da
Create Date: 2026-07-06 18:10:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1a2b3c4e5f6'
down_revision: Union[str, None] = 'c43412d527da'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("timetable_entries")}
    with op.batch_alter_table("timetable_entries", schema=None) as batch_op:
        if "entry_type" not in cols:
            batch_op.add_column(
                sa.Column("entry_type", sa.String(), nullable=False, server_default="period")
            )
        if "label" not in cols:
            batch_op.add_column(sa.Column("label", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("timetable_entries", schema=None) as batch_op:
        batch_op.drop_column("label")
        batch_op.drop_column("entry_type")
