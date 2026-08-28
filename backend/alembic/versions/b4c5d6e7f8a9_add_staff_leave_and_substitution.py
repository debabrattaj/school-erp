"""add leave_types, leave_balances, leave_requests, substitution_assignments

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "leave_types" not in tables:
        op.create_table(
            "leave_types",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("annual_quota", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("allow_negative_balance", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("code", name="uq_leave_type_code"),
        )

    if "leave_balances" not in tables:
        op.create_table(
            "leave_balances",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("leave_type_id", sa.Integer(), sa.ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("entitled_days", sa.Float(), nullable=False, server_default="0"),
            sa.Column("used_days", sa.Float(), nullable=False, server_default="0"),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("teacher_id", "leave_type_id", "academic_year", name="uq_leave_balance_scope"),
        )

    if "leave_requests" not in tables:
        op.create_table(
            "leave_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("leave_type_id", sa.Integer(), sa.ForeignKey("leave_types.id", ondelete="RESTRICT"), nullable=False),
            sa.Column("academic_year", sa.String(), nullable=True),
            sa.Column("from_date", sa.Date(), nullable=False),
            sa.Column("to_date", sa.Date(), nullable=False),
            sa.Column("days", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_half_day", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Requested"),
            sa.Column("decided_by", sa.String(), nullable=True),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_leave_requests_teacher_id", "leave_requests", ["teacher_id"])
        op.create_index("ix_leave_requests_status", "leave_requests", ["status"])

    if "substitution_assignments" not in tables:
        op.create_table(
            "substitution_assignments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("cover_date", sa.Date(), nullable=False),
            sa.Column("timetable_entry_id", sa.Integer(), sa.ForeignKey("timetable_entries.id", ondelete="CASCADE"), nullable=True),
            sa.Column("leave_request_id", sa.Integer(), sa.ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=True),
            sa.Column("absent_teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
            sa.Column("substitute_teacher_id", sa.Integer(), sa.ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True),
            sa.Column("period_no", sa.Integer(), nullable=True),
            sa.Column("class_name", sa.String(), nullable=True),
            sa.Column("section", sa.String(), nullable=True),
            sa.Column("subject", sa.String(), nullable=True),
            sa.Column("room", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Unassigned"),
            sa.Column("assigned_by", sa.String(), nullable=True),
            sa.Column("assigned_at", sa.DateTime(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("cover_date", "absent_teacher_id", "period_no", name="uq_substitution_slot"),
        )
        op.create_index("ix_substitution_cover_date", "substitution_assignments", ["cover_date"])
        op.create_index("ix_substitution_status", "substitution_assignments", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in ("substitution_assignments", "leave_requests", "leave_balances", "leave_types"):
        if table in tables:
            op.drop_table(table)
