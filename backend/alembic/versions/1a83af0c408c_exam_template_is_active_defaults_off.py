"""exam_templates.is_active now defaults to False, matching
FeeStructure.auto_generate and AcademicYear.auto_promote_enabled (existing
rows are left as-is; only the default for newly created templates changes)

Revision ID: 1a83af0c408c
Revises: b1c2d3e4f5a6
Create Date: 2026-08-09 09:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1a83af0c408c'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "exam_templates" in inspector.get_table_names():
        with op.batch_alter_table("exam_templates") as batch_op:
            batch_op.alter_column(
                "is_active",
                existing_type=sa.Boolean(),
                server_default=sa.false(),
                existing_nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "exam_templates" in inspector.get_table_names():
        with op.batch_alter_table("exam_templates") as batch_op:
            batch_op.alter_column(
                "is_active",
                existing_type=sa.Boolean(),
                server_default=sa.true(),
                existing_nullable=False,
            )
