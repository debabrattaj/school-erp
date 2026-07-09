"""add user mfa fields

Revision ID: 555c7b70d2fb
Revises: bc8c44c89af8
Create Date: 2026-07-06 06:51:05.083928
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '555c7b70d2fb'
down_revision: Union[str, None] = 'bc8c44c89af8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default backfills existing rows; the ORM-side default handles new ones.
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("users")}
    with op.batch_alter_table('users', schema=None) as batch_op:
        if "mfa_enabled" not in cols:
            batch_op.add_column(sa.Column('mfa_enabled', sa.Boolean(), nullable=False, server_default=sa.false()))
        if "mfa_secret" not in cols:
            batch_op.add_column(sa.Column('mfa_secret', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('mfa_secret')
        batch_op.drop_column('mfa_enabled')
