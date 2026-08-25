"""merge admissions/inventory/library branch with fees/leave/marks/attendance branch

Revision ID: 8ed076ae79bb
Revises: a1b2c3d4e5f6, f5a6b7c8d9e0
Create Date: 2026-08-25 09:10:24.775182
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ed076ae79bb'
down_revision: Union[str, None] = ('a1b2c3d4e5f6', 'f5a6b7c8d9e0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
