"""add payment_orders table and per-school gateway credentials on school_settings

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-08-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "school_settings" in tables:
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        for name in (
            "payment_provider",
            "payment_key_id",
            "payment_key_secret",
            "payment_webhook_secret",
        ):
            if name not in columns:
                op.add_column("school_settings", sa.Column(name, sa.String(), nullable=True))

    if "payment_orders" not in tables:
        op.create_table(
            "payment_orders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("fee_id", sa.Integer(), sa.ForeignKey("fees.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "student_id", sa.Integer(), sa.ForeignKey("students.id", ondelete="SET NULL"), nullable=True
            ),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("order_id", sa.String(), nullable=False),
            sa.Column("payment_id", sa.String(), nullable=True),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("currency", sa.String(), nullable=False, server_default="INR"),
            sa.Column("status", sa.String(), nullable=False, server_default="Created"),
            sa.Column("method", sa.String(), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("order_id", name="uq_payment_order_gateway_id"),
        )
        op.create_index("ix_payment_orders_fee_id", "payment_orders", ["fee_id"])
        op.create_index("ix_payment_orders_order_id", "payment_orders", ["order_id"])
        op.create_index("ix_payment_orders_payment_id", "payment_orders", ["payment_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "payment_orders" in tables:
        op.drop_table("payment_orders")

    if "school_settings" in tables:
        columns = {col["name"] for col in inspector.get_columns("school_settings")}
        for name in (
            "payment_webhook_secret",
            "payment_key_secret",
            "payment_key_id",
            "payment_provider",
        ):
            if name in columns:
                op.drop_column("school_settings", name)
