"""add college course fields and experiential learning

Revision ID: f9b0c1d2e3f4
Revises: f8a9b0c1d2e3
Create Date: 2026-11-01 10:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9b0c1d2e3f4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    subject_columns = {c["name"] for c in sa.inspect(bind).get_columns("subjects")}
    with op.batch_alter_table("subjects") as batch:
        for name, column in (
            ("department", sa.Column("department", sa.String(), nullable=True)),
            ("credits", sa.Column("credits", sa.Float(), nullable=True)),
            ("theory_hours", sa.Column("theory_hours", sa.Integer(), nullable=True)),
            ("practical_hours", sa.Column("practical_hours", sa.Integer(), nullable=True)),
        ):
            if name not in subject_columns:
                batch.add_column(column)
    class_subject_columns = {c["name"] for c in sa.inspect(bind).get_columns("class_subjects")}
    with op.batch_alter_table("class_subjects") as batch:
        if "credits" not in class_subject_columns:
            batch.add_column(sa.Column("credits", sa.Float(), nullable=True))
        if "practical_hours" not in class_subject_columns:
            batch.add_column(sa.Column("practical_hours", sa.Integer(), nullable=True))
    op.create_table(
        "experiential_learning",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False),
        sa.Column("academic_year", sa.String(), nullable=True),
        sa.Column("experience_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("organization", sa.String(), nullable=True),
        sa.Column("supervisor_name", sa.String(), nullable=True),
        sa.Column("supervisor_email", sa.String(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("required_hours", sa.Float(), nullable=True),
        sa.Column("completed_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="Planned"),
        sa.Column("evaluation", sa.String(), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("evidence_url", sa.String(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    for name in ("student_id", "academic_year", "experience_type", "status"):
        op.create_index(f"ix_experiential_learning_{name}", "experiential_learning", [name])


def downgrade() -> None:
    op.drop_table("experiential_learning")
    with op.batch_alter_table("class_subjects") as batch:
        batch.drop_column("practical_hours")
        batch.drop_column("credits")
    with op.batch_alter_table("subjects") as batch:
        batch.drop_column("practical_hours")
        batch.drop_column("theory_hours")
        batch.drop_column("credits")
        batch.drop_column("department")
