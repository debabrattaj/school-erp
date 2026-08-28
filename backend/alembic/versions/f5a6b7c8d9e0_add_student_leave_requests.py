"""add student_leave_requests table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-25 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "student_leave_requests" in inspector.get_table_names():
        return

    op.create_table(
        "student_leave_requests",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column(
            "student_id", sa.Integer(),
            sa.ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
        sa.Column("from_date", sa.Date(), nullable=False, index=True),
        sa.Column("to_date", sa.Date(), nullable=False, index=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="Requested"),
        sa.Column("requested_by", sa.String(), nullable=False),
        sa.Column("decided_by", sa.String(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_student_leave_requests_status", "student_leave_requests", ["status"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "student_leave_requests" not in inspector.get_table_names():
        return
    op.drop_table("student_leave_requests")
