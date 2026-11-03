"""add supervised experiential learning logbook

Revision ID: fb0c1d2e3f4a
Revises: fa0b1c2d3e4f
Create Date: 2026-11-01 11:45:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fb0c1d2e3f4a"
down_revision: Union[str, None] = "fa0b1c2d3e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("experiential_log_entries"):
        return
    op.create_table("experiential_log_entries",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("experience_id", sa.Integer(), sa.ForeignKey("experiential_learning.id", ondelete="CASCADE"), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False), sa.Column("activity", sa.String(), nullable=False), sa.Column("learning_outcome", sa.Text()), sa.Column("hours", sa.Float(), nullable=False, server_default="0"), sa.Column("supervisor_name", sa.String()), sa.Column("verification_status", sa.String(), nullable=False, server_default="Pending"), sa.Column("verified_at", sa.DateTime()), sa.Column("remarks", sa.Text()), sa.Column("created_at", sa.DateTime()), sa.UniqueConstraint("experience_id", "log_date", "activity", name="uq_experience_log_activity"))

def downgrade() -> None:
    op.drop_table("experiential_log_entries")
