"""add proctoring_snapshots table (Online Exam Proctoring Phase 2 -- webcam
snapshots)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-21 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "proctoring_snapshots" not in tables:
        op.create_table(
            "proctoring_snapshots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "session_id",
                sa.Integer(),
                sa.ForeignKey("proctoring_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("captured_at", sa.DateTime(), nullable=True),
            sa.Column("storage_path", sa.String(), nullable=True),
            sa.Column("file_size", sa.Integer(), nullable=True),
            sa.Column("content_type", sa.String(), nullable=False, server_default="image/jpeg"),
        )
        op.create_index("ix_proctoring_snapshots_session_id", "proctoring_snapshots", ["session_id"])
        op.create_index("ix_proctoring_snapshots_captured_at", "proctoring_snapshots", ["captured_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "proctoring_snapshots" in tables:
        op.drop_table("proctoring_snapshots")
