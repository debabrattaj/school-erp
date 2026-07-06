"""add timetable duration_min

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-07 09:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("timetable_entries")}
    if "duration_min" not in cols:
        with op.batch_alter_table("timetable_entries", schema=None) as batch_op:
            batch_op.add_column(sa.Column("duration_min", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("timetable_entries", schema=None) as batch_op:
        batch_op.drop_column("duration_min")
