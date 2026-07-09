"""add accounting: account_transactions table and inventory cost columns

Revision ID: c3d4e5f6a7b9
Revises: b2c3d4e5f6a8
Create Date: 2026-07-08 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b9'
down_revision: Union[str, None] = 'b2c3d4e5f6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "account_transactions" not in tables:
        op.create_table(
            "account_transactions",
            sa.Column("id", sa.Integer(), primary_key=True, index=True),
            sa.Column("entry_date", sa.Date(), nullable=False, index=True),
            sa.Column("entry_type", sa.String(), nullable=False, index=True),
            sa.Column("category", sa.String(), nullable=False, index=True),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("payment_mode", sa.String(), nullable=True),
            sa.Column("reference_no", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
        )

    if "inventory_items" in tables:
        item_columns = {col["name"] for col in inspector.get_columns("inventory_items")}
        if "unit_price" not in item_columns:
            op.add_column(
                "inventory_items",
                sa.Column("unit_price", sa.Float(), nullable=True, server_default="0"),
            )

    if "inventory_transactions" in tables:
        transaction_columns = {col["name"] for col in inspector.get_columns("inventory_transactions")}
        if "unit_cost" not in transaction_columns:
            op.add_column("inventory_transactions", sa.Column("unit_cost", sa.Float(), nullable=True))
        if "total_cost" not in transaction_columns:
            op.add_column("inventory_transactions", sa.Column("total_cost", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "inventory_transactions" in tables:
        transaction_columns = {col["name"] for col in inspector.get_columns("inventory_transactions")}
        if "total_cost" in transaction_columns:
            op.drop_column("inventory_transactions", "total_cost")
        if "unit_cost" in transaction_columns:
            op.drop_column("inventory_transactions", "unit_cost")

    if "inventory_items" in tables:
        item_columns = {col["name"] for col in inspector.get_columns("inventory_items")}
        if "unit_price" in item_columns:
            op.drop_column("inventory_items", "unit_price")

    if "account_transactions" in tables:
        op.drop_table("account_transactions")
