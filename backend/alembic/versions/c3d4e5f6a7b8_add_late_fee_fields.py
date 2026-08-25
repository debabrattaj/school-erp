"""add late fee fields to school_settings and fees

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if "school_settings" in table_names:
        columns = {c["name"] for c in inspector.get_columns("school_settings")}
        with op.batch_alter_table("school_settings") as batch:
            if "late_fee_amount" not in columns:
                batch.add_column(sa.Column("late_fee_amount", sa.Float(), nullable=True))
            if "late_fee_frequency" not in columns:
                batch.add_column(sa.Column("late_fee_frequency", sa.String(), nullable=True))
            if "late_fee_grace_days" not in columns:
                batch.add_column(
                    sa.Column("late_fee_grace_days", sa.Integer(), nullable=False, server_default="0")
                )

    if "fees" in table_names:
        columns = {c["name"] for c in inspector.get_columns("fees")}
        if "late_fee_charged" not in columns:
            with op.batch_alter_table("fees") as batch:
                batch.add_column(
                    sa.Column("late_fee_charged", sa.Float(), nullable=False, server_default="0")
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = inspector.get_table_names()

    if "fees" in table_names:
        columns = {c["name"] for c in inspector.get_columns("fees")}
        if "late_fee_charged" in columns:
            with op.batch_alter_table("fees") as batch:
                batch.drop_column("late_fee_charged")

    if "school_settings" in table_names:
        columns = {c["name"] for c in inspector.get_columns("school_settings")}
        with op.batch_alter_table("school_settings") as batch:
            if "late_fee_grace_days" in columns:
                batch.drop_column("late_fee_grace_days")
            if "late_fee_frequency" in columns:
                batch.drop_column("late_fee_frequency")
            if "late_fee_amount" in columns:
                batch.drop_column("late_fee_amount")
