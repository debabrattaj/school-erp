"""add inventory price and issuance cycle fields

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-07-08 11:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a8'
down_revision: Union[str, None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    item_cols = {c["name"] for c in sa.inspect(bind).get_columns("inventory_items")}
    if "unit_price" not in item_cols:
        with op.batch_alter_table("inventory_items", schema=None) as batch_op:
            batch_op.add_column(sa.Column("unit_price", sa.Float(), nullable=True))

    txn_cols = {c["name"] for c in sa.inspect(bind).get_columns("inventory_transactions")}
    with op.batch_alter_table("inventory_transactions", schema=None) as batch_op:
        if "cycle" not in txn_cols:
            batch_op.add_column(sa.Column("cycle", sa.String(), nullable=True))
        if "academic_year" not in txn_cols:
            batch_op.add_column(sa.Column("academic_year", sa.String(), nullable=True))
        if "unit_price" not in txn_cols:
            batch_op.add_column(sa.Column("unit_price", sa.Float(), nullable=True))
        if "amount" not in txn_cols:
            batch_op.add_column(sa.Column("amount", sa.Float(), nullable=True))
        if "payment_status" not in txn_cols:
            batch_op.add_column(sa.Column("payment_status", sa.String(), nullable=True))

    existing_indexes = {
        idx["name"] for idx in sa.inspect(bind).get_indexes("inventory_transactions")
    }
    with op.batch_alter_table("inventory_transactions", schema=None) as batch_op:
        if "ix_inventory_transactions_cycle" not in existing_indexes:
            batch_op.create_index(
                "ix_inventory_transactions_cycle", ["cycle"], unique=False
            )
        if "ix_inventory_transactions_academic_year" not in existing_indexes:
            batch_op.create_index(
                "ix_inventory_transactions_academic_year", ["academic_year"], unique=False
            )


def downgrade() -> None:
    with op.batch_alter_table("inventory_transactions", schema=None) as batch_op:
        batch_op.drop_index("ix_inventory_transactions_academic_year")
        batch_op.drop_index("ix_inventory_transactions_cycle")
        batch_op.drop_column("payment_status")
        batch_op.drop_column("amount")
        batch_op.drop_column("unit_price")
        batch_op.drop_column("academic_year")
        batch_op.drop_column("cycle")

    with op.batch_alter_table("inventory_items", schema=None) as batch_op:
        batch_op.drop_column("unit_price")
