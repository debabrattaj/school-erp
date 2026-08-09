"""replace exam_templates.offset_days with next_run_date + last_generated_at,
drop exam_generation_runs' now-invalid uniqueness constraint

Revision ID: b1c2d3e4f5a6
Revises: f7a8b9c0d1e2
Create Date: 2026-08-09 06:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "exam_templates" in tables:
        columns = {col["name"] for col in inspector.get_columns("exam_templates")}
        if "next_run_date" not in columns:
            op.add_column("exam_templates", sa.Column("next_run_date", sa.Date(), nullable=True))
        if "last_generated_at" not in columns:
            op.add_column("exam_templates", sa.Column("last_generated_at", sa.DateTime(), nullable=True))
        if "offset_days" in columns:
            with op.batch_alter_table("exam_templates") as batch_op:
                batch_op.drop_column("offset_days")

    if "exam_generation_runs" in tables:
        existing_uniques = {uq["name"] for uq in inspector.get_unique_constraints("exam_generation_runs")}
        if "uq_exam_run_template_year" in existing_uniques:
            with op.batch_alter_table("exam_generation_runs") as batch_op:
                batch_op.drop_constraint("uq_exam_run_template_year", type_="unique")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "exam_generation_runs" in tables:
        existing_uniques = {uq["name"] for uq in inspector.get_unique_constraints("exam_generation_runs")}
        if "uq_exam_run_template_year" not in existing_uniques:
            with op.batch_alter_table("exam_generation_runs") as batch_op:
                batch_op.create_unique_constraint(
                    "uq_exam_run_template_year", ["exam_template_id", "academic_year"]
                )

    if "exam_templates" in tables:
        columns = {col["name"] for col in inspector.get_columns("exam_templates")}
        if "offset_days" not in columns:
            op.add_column(
                "exam_templates",
                sa.Column("offset_days", sa.Integer(), nullable=False, server_default="0"),
            )
        if "last_generated_at" in columns:
            with op.batch_alter_table("exam_templates") as batch_op:
                batch_op.drop_column("last_generated_at")
        if "next_run_date" in columns:
            with op.batch_alter_table("exam_templates") as batch_op:
                batch_op.drop_column("next_run_date")
