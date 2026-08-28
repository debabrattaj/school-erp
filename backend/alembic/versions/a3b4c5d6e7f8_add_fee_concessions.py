"""add concession_schemes, student_concessions and fees.concession_amount

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "fees" in tables:
        columns = {col["name"] for col in inspector.get_columns("fees")}
        if "concession_amount" not in columns:
            # server_default 0 so every existing fee keeps its current balance.
            op.add_column(
                "fees",
                sa.Column("concession_amount", sa.Float(), nullable=False, server_default="0"),
            )

    if "concession_schemes" not in tables:
        op.create_table(
            "concession_schemes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("category", sa.String(), nullable=True),
            sa.Column("discount_type", sa.String(), nullable=False, server_default="percent"),
            sa.Column("discount_value", sa.Float(), nullable=False, server_default="0"),
            sa.Column("applies_to_fee_type", sa.String(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("code", name="uq_concession_scheme_code"),
        )
        op.create_index("ix_concession_schemes_code", "concession_schemes", ["code"])

    if "student_concessions" not in tables:
        op.create_table(
            "student_concessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "student_id", sa.Integer(),
                sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False,
            ),
            sa.Column(
                "scheme_id", sa.Integer(),
                sa.ForeignKey("concession_schemes.id", ondelete="RESTRICT"), nullable=False,
            ),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("discount_type", sa.String(), nullable=True),
            sa.Column("discount_value", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Requested"),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("requested_by", sa.String(), nullable=True),
            sa.Column("requested_at", sa.DateTime(), nullable=True),
            sa.Column("decided_by", sa.String(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("valid_from", sa.Date(), nullable=True),
            sa.Column("valid_to", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_student_concessions_student_id", "student_concessions", ["student_id"])
        op.create_index("ix_student_concessions_status", "student_concessions", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "student_concessions" in tables:
        op.drop_table("student_concessions")
    if "concession_schemes" in tables:
        op.drop_table("concession_schemes")
    if "fees" in tables:
        columns = {col["name"] for col in inspector.get_columns("fees")}
        if "concession_amount" in columns:
            op.drop_column("fees", "concession_amount")
