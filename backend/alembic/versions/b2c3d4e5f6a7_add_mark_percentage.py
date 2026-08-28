"""add marks.percentage

Revision ID: b1c2d3e4f5a6
Revises: e3f4a5b6c7d8
Create Date: 2026-08-24 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "marks" not in inspector.get_table_names():
        return

    columns = {c["name"] for c in inspector.get_columns("marks")}
    if "percentage" in columns:
        return

    with op.batch_alter_table("marks") as batch:
        batch.add_column(sa.Column("percentage", sa.Float(), nullable=True))

    # Backfill existing rows with the raw percentage they were always
    # graded on -- component weightage didn't exist as a scoring input
    # before this migration, so every historical mark's percentage is
    # simply marks_obtained/total_marks.
    op.execute(
        "UPDATE marks SET percentage = (marks_obtained * 100.0 / total_marks) "
        "WHERE total_marks IS NOT NULL AND total_marks > 0"
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "marks" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("marks")}
    if "percentage" not in columns:
        return

    with op.batch_alter_table("marks") as batch:
        batch.drop_column("percentage")
