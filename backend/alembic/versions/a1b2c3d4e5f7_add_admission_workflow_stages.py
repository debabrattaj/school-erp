"""add admission_workflow_stages

Revision ID: a1b2c3d4e5f7
Revises: f6a7b8c9d0e1
Create Date: 2026-07-07 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_STAGES = [
    ("Inquiry", 1, False),
    ("Contacted", 2, False),
    ("Visit Scheduled", 3, False),
    ("Assessment", 4, False),
    ("Offered", 5, False),
    ("Enrolled", 6, True),
    ("Lost", 7, True),
]


def upgrade() -> None:
    bind = op.get_bind()
    tables = sa.inspect(bind).get_table_names()
    if "admission_workflow_stages" not in tables:
        op.create_table(
            "admission_workflow_stages",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("name", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("sort_order", sa.Integer(), nullable=True),
            sa.Column("is_terminal", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
        )

    existing = bind.execute(sa.text("SELECT COUNT(*) FROM admission_workflow_stages")).scalar()
    if not existing:
        table = sa.table(
            "admission_workflow_stages",
            sa.column("name", sa.String()),
            sa.column("sort_order", sa.Integer()),
            sa.column("is_terminal", sa.Boolean()),
        )
        op.bulk_insert(table, [
            {"name": name, "sort_order": order, "is_terminal": terminal}
            for name, order, terminal in DEFAULT_STAGES
        ])


def downgrade() -> None:
    op.drop_table("admission_workflow_stages")
