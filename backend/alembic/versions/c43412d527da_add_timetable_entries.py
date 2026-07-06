"""add timetable entries

Revision ID: c43412d527da
Revises: 555c7b70d2fb
Create Date: 2026-07-06 17:32:18.188042
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c43412d527da'
down_revision: Union[str, None] = '555c7b70d2fb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: the app's create_all() may already have created this table on
    # existing databases, so only create it where it is missing.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "timetable_entries" in inspector.get_table_names():
        return

    op.create_table(
        "timetable_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("academic_year", sa.String(), nullable=True),
        sa.Column("class_id", sa.Integer(), sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=True),
        sa.Column("class_name_snapshot", sa.String(), nullable=True),
        sa.Column("section_snapshot", sa.String(), nullable=True),
        sa.Column("day_of_week", sa.String(), nullable=False),
        sa.Column("period_no", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(), nullable=True),
        sa.Column("end_time", sa.String(), nullable=True),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("teacher_name_snapshot", sa.String(), nullable=True),
        sa.Column("room", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "academic_year", "class_id", "day_of_week", "period_no",
            name="uq_timetable_slot",
        ),
    )
    op.create_index("ix_timetable_entries_academic_year", "timetable_entries", ["academic_year"])
    op.create_index("ix_timetable_entries_class_id", "timetable_entries", ["class_id"])
    op.create_index("ix_timetable_entries_day_of_week", "timetable_entries", ["day_of_week"])
    op.create_index("ix_timetable_entries_teacher_id", "timetable_entries", ["teacher_id"])


def downgrade() -> None:
    op.drop_table("timetable_entries")
