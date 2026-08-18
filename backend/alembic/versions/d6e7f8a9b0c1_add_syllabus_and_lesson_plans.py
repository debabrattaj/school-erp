"""add syllabus_units, syllabus_topics, lesson_plans

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "syllabus_units" not in tables:
        op.create_table(
            "syllabus_units",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("class_subject_id", sa.Integer(), nullable=False),
            sa.Column("sequence_no", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("planned_periods", sa.Integer(), nullable=True),
            sa.Column("planned_start", sa.Date(), nullable=True),
            sa.Column("planned_end", sa.Date(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Pending"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["class_subject_id"], ["class_subjects.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_syllabus_units_class_subject_id", "syllabus_units", ["class_subject_id"])
        op.create_index("ix_syllabus_units_planned_end", "syllabus_units", ["planned_end"])
        op.create_index("ix_syllabus_units_status", "syllabus_units", ["status"])

    if "syllabus_topics" not in tables:
        op.create_table(
            "syllabus_topics",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("unit_id", sa.Integer(), nullable=False),
            sa.Column("sequence_no", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("planned_periods", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("status", sa.String(), nullable=False, server_default="Pending"),
            sa.Column("completed_on", sa.Date(), nullable=True),
            sa.Column("completed_by", sa.String(), nullable=True),
            sa.Column("periods_taken", sa.Integer(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["unit_id"], ["syllabus_units.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_syllabus_topics_unit_id", "syllabus_topics", ["unit_id"])
        op.create_index("ix_syllabus_topics_status", "syllabus_topics", ["status"])

    if "lesson_plans" not in tables:
        op.create_table(
            "lesson_plans",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("class_subject_id", sa.Integer(), nullable=False),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.Column("topic_id", sa.Integer(), nullable=True),
            sa.Column("plan_date", sa.Date(), nullable=False),
            sa.Column("period_no", sa.Integer(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("objectives", sa.Text(), nullable=True),
            sa.Column("teaching_method", sa.Text(), nullable=True),
            sa.Column("resources", sa.Text(), nullable=True),
            sa.Column("homework", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Planned"),
            sa.Column("delivered_at", sa.DateTime(), nullable=True),
            sa.Column("delivery_note", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(), nullable=False, server_default="Pending"),
            sa.Column("reviewed_by", sa.String(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["class_subject_id"], ["class_subjects.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["topic_id"], ["syllabus_topics.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_lesson_plans_class_subject_id", "lesson_plans", ["class_subject_id"])
        op.create_index("ix_lesson_plans_teacher_id", "lesson_plans", ["teacher_id"])
        op.create_index("ix_lesson_plans_topic_id", "lesson_plans", ["topic_id"])
        op.create_index("ix_lesson_plans_plan_date", "lesson_plans", ["plan_date"])
        op.create_index("ix_lesson_plans_status", "lesson_plans", ["status"])
        op.create_index("ix_lesson_plans_review_status", "lesson_plans", ["review_status"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Children before parents: lesson_plans points at syllabus_topics.
    for table in ("lesson_plans", "syllabus_topics", "syllabus_units"):
        if table in tables:
            op.drop_table(table)
