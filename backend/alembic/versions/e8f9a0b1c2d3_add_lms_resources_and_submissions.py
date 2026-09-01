"""add learning_resources, learning_resource_views, assignment_submissions

Revision ID: e8f9a0b1c2d3
Revises: c7d8e9f0a1b2
Create Date: 2026-09-01 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8f9a0b1c2d3'
down_revision: Union[str, None] = 'c7d8e9f0a1b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "learning_resources" not in tables:
        op.create_table(
            "learning_resources",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("class_name", sa.String(), nullable=False),
            sa.Column("section", sa.String(), nullable=True),
            sa.Column("subject", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("resource_type", sa.String(), nullable=False, server_default="Document"),
            sa.Column("url", sa.String(), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("syllabus_unit_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Draft"),
            sa.Column("available_from", sa.Date(), nullable=True),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.Column("teacher_name_snapshot", sa.String(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["syllabus_unit_id"], ["syllabus_units.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_learning_resources_class_name", "learning_resources", ["class_name"])
        op.create_index("ix_learning_resources_section", "learning_resources", ["section"])
        op.create_index("ix_learning_resources_subject", "learning_resources", ["subject"])
        op.create_index("ix_learning_resources_status", "learning_resources", ["status"])
        op.create_index("ix_learning_resources_academic_year", "learning_resources", ["academic_year"])
        op.create_index("ix_learning_resources_available_from", "learning_resources", ["available_from"])
        op.create_index("ix_learning_resources_teacher_id", "learning_resources", ["teacher_id"])
        op.create_index("ix_learning_resources_syllabus_unit_id", "learning_resources", ["syllabus_unit_id"])
        op.create_index("ix_learning_resources_resource_type", "learning_resources", ["resource_type"])

    if "learning_resource_views" not in tables:
        op.create_table(
            "learning_resource_views",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("resource_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("view_count", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("first_viewed_at", sa.DateTime(), nullable=True),
            sa.Column("last_viewed_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["resource_id"], ["learning_resources.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("resource_id", "student_id", name="uq_resource_view_student"),
        )
        op.create_index("ix_learning_resource_views_resource_id", "learning_resource_views", ["resource_id"])
        op.create_index("ix_learning_resource_views_student_id", "learning_resource_views", ["student_id"])

    # Homework predates Alembic tracking on this project: the assignments
    # table only ever came from create_all(), so a database migrated purely
    # from the baseline does not have it and the foreign key below would have
    # nothing to point at. Create it here in its current shape (the three new
    # columns included) rather than leaving the chain unrunnable on a backend
    # that actually enforces foreign keys.
    if "assignments" not in tables:
        op.create_table(
            "assignments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("class_name", sa.String(), nullable=False),
            sa.Column("section", sa.String(), nullable=True),
            sa.Column("subject", sa.String(), nullable=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("due_date", sa.Date(), nullable=True),
            sa.Column("attachment_url", sa.String(), nullable=True),
            sa.Column("max_marks", sa.Float(), nullable=True),
            sa.Column("accepts_submissions", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("allow_late_submission", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.Column("teacher_name_snapshot", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="SET NULL"),
        )
        op.create_index("ix_assignments_class_name", "assignments", ["class_name"])
        op.create_index("ix_assignments_section", "assignments", ["section"])
        op.create_index("ix_assignments_academic_year", "assignments", ["academic_year"])
        op.create_index("ix_assignments_due_date", "assignments", ["due_date"])
        op.create_index("ix_assignments_teacher_id", "assignments", ["teacher_id"])
        tables = sa.inspect(bind).get_table_names()

    if "assignment_submissions" not in tables:
        op.create_table(
            "assignment_submissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("assignment_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("student_name_snapshot", sa.String(), nullable=True),
            sa.Column("content", sa.Text(), nullable=True),
            sa.Column("attachment_url", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Submitted"),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("is_late", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("submitted_by", sa.String(), nullable=True),
            sa.Column("marks_awarded", sa.Float(), nullable=True),
            sa.Column("feedback", sa.Text(), nullable=True),
            sa.Column("graded_by", sa.String(), nullable=True),
            sa.Column("graded_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["assignment_id"], ["assignments.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
        )
        op.create_index("ix_assignment_submissions_assignment_id", "assignment_submissions", ["assignment_id"])
        op.create_index("ix_assignment_submissions_student_id", "assignment_submissions", ["student_id"])
        op.create_index("ix_assignment_submissions_status", "assignment_submissions", ["status"])
        op.create_index("ix_assignment_submissions_submitted_at", "assignment_submissions", ["submitted_at"])

    if "assignments" in tables:
        columns = {c["name"] for c in inspector.get_columns("assignments")}
        with op.batch_alter_table("assignments") as batch:
            if "max_marks" not in columns:
                batch.add_column(sa.Column("max_marks", sa.Float(), nullable=True))
            # Existing homework predates the drop-box, and a school that
            # turns the LMS on should find its current assignments ready to
            # accept work rather than silently closed.
            if "accepts_submissions" not in columns:
                batch.add_column(sa.Column(
                    "accepts_submissions", sa.Boolean(), nullable=False, server_default=sa.text("1"),
                ))
            if "allow_late_submission" not in columns:
                batch.add_column(sa.Column(
                    "allow_late_submission", sa.Boolean(), nullable=False, server_default=sa.text("1"),
                ))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "assignments" in tables:
        columns = {c["name"] for c in inspector.get_columns("assignments")}
        with op.batch_alter_table("assignments") as batch:
            for name in ("allow_late_submission", "accepts_submissions", "max_marks"):
                if name in columns:
                    batch.drop_column(name)

    for table in ("assignment_submissions", "learning_resource_views", "learning_resources"):
        if table in tables:
            op.drop_table(table)
