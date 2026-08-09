"""add scheduled auto-promotion fields to academic_years, promotion_generation_runs,
exam_templates, exam_generation_runs, and exams.generated_from_template_id

Revision ID: f7a8b9c0d1e2
Revises: d0559c83d84c
Create Date: 2026-08-09 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'd0559c83d84c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "academic_years" in tables:
        columns = {col["name"] for col in inspector.get_columns("academic_years")}
        if "auto_promote_enabled" not in columns:
            op.add_column(
                "academic_years",
                sa.Column("auto_promote_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "auto_promote_date" not in columns:
            op.add_column("academic_years", sa.Column("auto_promote_date", sa.Date(), nullable=True))
        if "auto_promote_to_year" not in columns:
            op.add_column("academic_years", sa.Column("auto_promote_to_year", sa.String(), nullable=True))
        if "auto_promote_carry_forward_fees" not in columns:
            op.add_column(
                "academic_years",
                sa.Column("auto_promote_carry_forward_fees", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "auto_promoted_at" not in columns:
            op.add_column("academic_years", sa.Column("auto_promoted_at", sa.DateTime(), nullable=True))

    if "promotion_generation_runs" not in tables:
        op.create_table(
            "promotion_generation_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("from_academic_year", sa.String(), nullable=False),
            sa.Column("to_academic_year", sa.String(), nullable=True),
            sa.Column("run_at", sa.DateTime(), nullable=True),
            sa.Column("promoted_count", sa.Integer(), nullable=True),
            sa.Column("detained_count", sa.Integer(), nullable=True),
            sa.Column("graduated_count", sa.Integer(), nullable=True),
            sa.Column("skipped_count", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.UniqueConstraint("from_academic_year", name="uq_promotion_run_from_year"),
        )

    if "exam_templates" not in tables:
        op.create_table(
            "exam_templates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False, unique=True),
            sa.Column("exam_type", sa.String(), nullable=True),
            sa.Column("offset_days", sa.Integer(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if "exam_generation_runs" not in tables:
        op.create_table(
            "exam_generation_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "exam_template_id",
                sa.Integer(),
                sa.ForeignKey("exam_templates.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("academic_year", sa.String(), nullable=False),
            sa.Column("exam_id", sa.Integer(), sa.ForeignKey("exams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("run_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.UniqueConstraint("exam_template_id", "academic_year", name="uq_exam_run_template_year"),
        )

    if "exams" in tables:
        columns = {col["name"] for col in inspector.get_columns("exams")}
        if "generated_from_template_id" not in columns:
            with op.batch_alter_table("exams") as batch_op:
                batch_op.add_column(sa.Column("generated_from_template_id", sa.Integer(), nullable=True))
                batch_op.create_foreign_key(
                    "fk_exams_generated_from_template_id",
                    "exam_templates",
                    ["generated_from_template_id"],
                    ["id"],
                    ondelete="SET NULL",
                )
            op.create_index(
                "ix_exams_generated_from_template_id", "exams", ["generated_from_template_id"]
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "exams" in tables:
        columns = {col["name"] for col in inspector.get_columns("exams")}
        if "generated_from_template_id" in columns:
            op.drop_index("ix_exams_generated_from_template_id", table_name="exams")
            with op.batch_alter_table("exams") as batch_op:
                batch_op.drop_constraint("fk_exams_generated_from_template_id", type_="foreignkey")
                batch_op.drop_column("generated_from_template_id")

    if "exam_generation_runs" in tables:
        op.drop_table("exam_generation_runs")

    if "exam_templates" in tables:
        op.drop_table("exam_templates")

    if "promotion_generation_runs" in tables:
        op.drop_table("promotion_generation_runs")

    if "academic_years" in tables:
        columns = {col["name"] for col in inspector.get_columns("academic_years")}
        for col_name in (
            "auto_promoted_at",
            "auto_promote_carry_forward_fees",
            "auto_promote_to_year",
            "auto_promote_date",
            "auto_promote_enabled",
        ):
            if col_name in columns:
                op.drop_column("academic_years", col_name)
