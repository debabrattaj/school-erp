"""add shuffle_questions/shuffle_options to online_tests and
auto_submitted_reason to online_test_attempts

Revision ID: c9d0e1f2a3b4
Revises: 1a83af0c408c
Create Date: 2026-08-16 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = '1a83af0c408c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "online_tests" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_tests")}
        if "shuffle_questions" not in columns:
            op.add_column(
                "online_tests",
                sa.Column("shuffle_questions", sa.Boolean(), nullable=False, server_default=sa.false()),
            )
        if "shuffle_options" not in columns:
            op.add_column(
                "online_tests",
                sa.Column("shuffle_options", sa.Boolean(), nullable=False, server_default=sa.false()),
            )

    if "online_test_attempts" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_test_attempts")}
        if "auto_submitted_reason" not in columns:
            op.add_column(
                "online_test_attempts",
                sa.Column("auto_submitted_reason", sa.String(), nullable=True),
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "online_test_attempts" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_test_attempts")}
        if "auto_submitted_reason" in columns:
            op.drop_column("online_test_attempts", "auto_submitted_reason")

    if "online_tests" in tables:
        columns = {col["name"] for col in inspector.get_columns("online_tests")}
        for col_name in ("shuffle_options", "shuffle_questions"):
            if col_name in columns:
                op.drop_column("online_tests", col_name)
