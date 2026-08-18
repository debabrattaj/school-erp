"""add blocked_visitors, visitor_passes, gate_passes

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "blocked_visitors" not in tables:
        op.create_table(
            "blocked_visitors",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("id_proof_number", sa.String(), nullable=True),
            sa.Column("reason", sa.Text(), nullable=False),
            sa.Column("blocked_by", sa.String(), nullable=True),
            sa.Column("blocked_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("lifted_by", sa.String(), nullable=True),
            sa.Column("lifted_at", sa.DateTime(), nullable=True),
            sa.Column("lifted_note", sa.Text(), nullable=True),
        )
        op.create_index("ix_blocked_visitors_phone", "blocked_visitors", ["phone"])
        op.create_index("ix_blocked_visitors_id_proof_number", "blocked_visitors", ["id_proof_number"])

    if "visitor_passes" not in tables:
        op.create_table(
            "visitor_passes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("pass_no", sa.String(), nullable=False),
            sa.Column("visitor_name", sa.String(), nullable=False),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("visitor_type", sa.String(), nullable=True),
            sa.Column("organisation", sa.String(), nullable=True),
            sa.Column("id_proof_type", sa.String(), nullable=True),
            sa.Column("id_proof_number", sa.String(), nullable=True),
            sa.Column("photo_url", sa.String(), nullable=True),
            sa.Column("purpose", sa.Text(), nullable=True),
            sa.Column("party_size", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("vehicle_number", sa.String(), nullable=True),
            sa.Column("host_student_id", sa.Integer(), nullable=True),
            sa.Column("host_teacher_id", sa.Integer(), nullable=True),
            sa.Column("host_department", sa.String(), nullable=True),
            sa.Column("visit_date", sa.Date(), nullable=False),
            sa.Column("checked_in_at", sa.DateTime(), nullable=True),
            sa.Column("checked_out_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Expected"),
            sa.Column("denied_reason", sa.Text(), nullable=True),
            sa.Column("issued_by", sa.String(), nullable=True),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["host_student_id"], ["students.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["host_teacher_id"], ["teachers.id"], ondelete="SET NULL"),
            sa.UniqueConstraint("pass_no", name="uq_visitor_pass_no"),
        )
        op.create_index("ix_visitor_passes_pass_no", "visitor_passes", ["pass_no"])
        op.create_index("ix_visitor_passes_visit_date", "visitor_passes", ["visit_date"])
        op.create_index("ix_visitor_passes_status", "visitor_passes", ["status"])
        op.create_index("ix_visitor_passes_phone", "visitor_passes", ["phone"])
        op.create_index("ix_visitor_passes_id_proof_number", "visitor_passes", ["id_proof_number"])
        op.create_index("ix_visitor_passes_host_student_id", "visitor_passes", ["host_student_id"])
        op.create_index("ix_visitor_passes_host_teacher_id", "visitor_passes", ["host_teacher_id"])

    if "gate_passes" not in tables:
        op.create_table(
            "gate_passes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("pass_no", sa.String(), nullable=False),
            sa.Column("pass_type", sa.String(), nullable=False, server_default="Student"),
            sa.Column("student_id", sa.Integer(), nullable=True),
            sa.Column("teacher_id", sa.Integer(), nullable=True),
            sa.Column("pass_date", sa.Date(), nullable=False),
            sa.Column("reason", sa.Text(), nullable=True),
            sa.Column("expected_return", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("expected_return_at", sa.DateTime(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Requested"),
            sa.Column("approved_by", sa.String(), nullable=True),
            sa.Column("approved_at", sa.DateTime(), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=True),
            sa.Column("collected_by_name", sa.String(), nullable=True),
            sa.Column("collected_by_relation", sa.String(), nullable=True),
            sa.Column("collected_by_phone", sa.String(), nullable=True),
            sa.Column("collected_by_id_proof", sa.String(), nullable=True),
            sa.Column("collector_matched_contact", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("released_by", sa.String(), nullable=True),
            sa.Column("released_at", sa.DateTime(), nullable=True),
            sa.Column("returned_at", sa.DateTime(), nullable=True),
            sa.Column("returned_recorded_by", sa.String(), nullable=True),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("pass_no", name="uq_gate_pass_no"),
        )
        op.create_index("ix_gate_passes_pass_no", "gate_passes", ["pass_no"])
        op.create_index("ix_gate_passes_pass_type", "gate_passes", ["pass_type"])
        op.create_index("ix_gate_passes_pass_date", "gate_passes", ["pass_date"])
        op.create_index("ix_gate_passes_status", "gate_passes", ["status"])
        op.create_index("ix_gate_passes_student_id", "gate_passes", ["student_id"])
        op.create_index("ix_gate_passes_teacher_id", "gate_passes", ["teacher_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    for table in ("gate_passes", "visitor_passes", "blocked_visitors"):
        if table in tables:
            op.drop_table(table)
