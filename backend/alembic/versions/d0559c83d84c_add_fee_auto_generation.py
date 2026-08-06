"""add scheduled auto-generation fields to fee_structures/fees, and fee_generation_runs

Revision ID: d0559c83d84c
Revises: d4e5f6a7b8c0
Create Date: 2026-08-06 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd0559c83d84c'
down_revision: Union[str, None] = 'd4e5f6a7b8c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "fee_structures" in tables:
        columns = {col["name"] for col in inspector.get_columns("fee_structures")}
        if "auto_generate" not in columns:
            op.add_column(
                "fee_structures",
                sa.Column("auto_generate", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "recurrence" not in columns:
            op.add_column("fee_structures", sa.Column("recurrence", sa.String(), nullable=True))
        if "next_run_date" not in columns:
            op.add_column("fee_structures", sa.Column("next_run_date", sa.Date(), nullable=True))
        if "last_generated_at" not in columns:
            op.add_column("fee_structures", sa.Column("last_generated_at", sa.DateTime(), nullable=True))

    if "fees" in tables:
        columns = {col["name"] for col in inspector.get_columns("fees")}
        if "billing_period" not in columns:
            op.add_column("fees", sa.Column("billing_period", sa.String(), nullable=True))
            op.create_index("ix_fees_billing_period", "fees", ["billing_period"])

    if "fee_generation_runs" not in tables:
        op.create_table(
            "fee_generation_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "fee_structure_id",
                sa.Integer(),
                sa.ForeignKey("fee_structures.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("academic_year", sa.String(), nullable=False),
            sa.Column("fee_type", sa.String(), nullable=False),
            sa.Column("class_name", sa.String(), nullable=True),
            sa.Column("billing_period", sa.String(), nullable=False),
            sa.Column("run_at", sa.DateTime(), nullable=True),
            sa.Column("students_billed", sa.Integer(), nullable=True),
            sa.Column("students_skipped", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("error_message", sa.String(), nullable=True),
            sa.UniqueConstraint(
                "fee_structure_id", "billing_period", name="uq_fee_generation_run_structure_period"
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "fee_generation_runs" in tables:
        op.drop_table("fee_generation_runs")

    if "fees" in tables:
        columns = {col["name"] for col in inspector.get_columns("fees")}
        if "billing_period" in columns:
            op.drop_index("ix_fees_billing_period", table_name="fees")
            op.drop_column("fees", "billing_period")

    if "fee_structures" in tables:
        columns = {col["name"] for col in inspector.get_columns("fee_structures")}
        for col_name in ("last_generated_at", "next_run_date", "recurrence", "auto_generate"):
            if col_name in columns:
                op.drop_column("fee_structures", col_name)
