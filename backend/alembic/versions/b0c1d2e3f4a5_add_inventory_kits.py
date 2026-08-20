"""add inventory_kits, inventory_kit_items, and staff-issuance columns on
inventory_transactions

Revision ID: b0c1d2e3f4a5
Revises: a9b0c1d2e3f4
Create Date: 2026-08-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b0c1d2e3f4a5'
down_revision: Union[str, None] = 'a9b0c1d2e3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "inventory_kits" not in tables:
        op.create_table(
            "inventory_kits",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("applies_to", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("name", name="uq_inventory_kit_name"),
        )
        op.create_index("ix_inventory_kits_applies_to", "inventory_kits", ["applies_to"])

    if "inventory_kit_items" not in tables:
        op.create_table(
            "inventory_kit_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("kit_id", sa.Integer(), nullable=False),
            sa.Column("item_id", sa.Integer(), nullable=False),
            sa.Column("quantity", sa.Float(), nullable=False, server_default="1"),
            sa.ForeignKeyConstraint(["kit_id"], ["inventory_kits.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["item_id"], ["inventory_items.id"]),
            sa.UniqueConstraint("kit_id", "item_id", name="uq_inventory_kit_item"),
        )
        op.create_index("ix_inventory_kit_items_kit_id", "inventory_kit_items", ["kit_id"])
        op.create_index("ix_inventory_kit_items_item_id", "inventory_kit_items", ["item_id"])

    if "inventory_transactions" in tables:
        columns = {c["name"] for c in inspector.get_columns("inventory_transactions")}
        with op.batch_alter_table("inventory_transactions") as batch:
            if "issued_to_teacher_id" not in columns:
                batch.add_column(sa.Column("issued_to_teacher_id", sa.Integer(), nullable=True))
                batch.create_foreign_key(
                    "fk_inv_txn_teacher", "teachers", ["issued_to_teacher_id"], ["id"],
                    ondelete="SET NULL",
                )
            if "kit_id" not in columns:
                batch.add_column(sa.Column("kit_id", sa.Integer(), nullable=True))
                batch.create_foreign_key(
                    "fk_inv_txn_kit", "inventory_kits", ["kit_id"], ["id"], ondelete="SET NULL",
                )

        columns = {c["name"] for c in inspector.get_columns("inventory_transactions")}
        if "issued_to_teacher_id" in columns:
            op.create_index(
                "ix_inventory_transactions_issued_to_teacher_id",
                "inventory_transactions", ["issued_to_teacher_id"],
            )
        if "kit_id" in columns:
            op.create_index(
                "ix_inventory_transactions_kit_id", "inventory_transactions", ["kit_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "inventory_transactions" in tables:
        columns = {c["name"] for c in inspector.get_columns("inventory_transactions")}
        indexes = {i["name"] for i in inspector.get_indexes("inventory_transactions")}
        with op.batch_alter_table("inventory_transactions") as batch:
            if "ix_inventory_transactions_kit_id" in indexes:
                batch.drop_index("ix_inventory_transactions_kit_id")
            if "ix_inventory_transactions_issued_to_teacher_id" in indexes:
                batch.drop_index("ix_inventory_transactions_issued_to_teacher_id")
            if "kit_id" in columns:
                batch.drop_constraint("fk_inv_txn_kit", type_="foreignkey")
                batch.drop_column("kit_id")
            if "issued_to_teacher_id" in columns:
                batch.drop_constraint("fk_inv_txn_teacher", type_="foreignkey")
                batch.drop_column("issued_to_teacher_id")

    # Children before parents: kit items reference kits.
    for table in ("inventory_kit_items", "inventory_kits"):
        if table in tables:
            op.drop_table(table)
