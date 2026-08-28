"""add fee_reminder_rules and fee_reminder_logs

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
Create Date: 2026-08-19 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f8a9b0c1d2e3'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if "fee_reminder_rules" not in tables:
        op.create_table(
            "fee_reminder_rules",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("offset_days", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("channel", sa.String(), nullable=False, server_default="Email"),
            sa.Column("template_id", sa.Integer(), nullable=True),
            sa.Column("min_due_amount", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["template_id"], ["communication_templates.id"],
                                    ondelete="SET NULL"),
            sa.UniqueConstraint("offset_days", "channel", name="uq_fee_reminder_rung"),
        )

    if "fee_reminder_logs" not in tables:
        op.create_table(
            "fee_reminder_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("fee_id", sa.Integer(), nullable=False),
            sa.Column("rule_id", sa.Integer(), nullable=False),
            sa.Column("student_id", sa.Integer(), nullable=True),
            sa.Column("communication_log_id", sa.Integer(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="Sent"),
            sa.Column("skip_reason", sa.String(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("outstanding_amount", sa.Float(), nullable=True),
            sa.Column("recipient", sa.String(), nullable=True),
            sa.Column("offset_days", sa.Integer(), nullable=True),
            sa.Column("sent_on", sa.Date(), nullable=False),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["fee_id"], ["fees.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["rule_id"], ["fee_reminder_rules.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["communication_log_id"], ["communication_logs.id"],
                                    ondelete="SET NULL"),
            # The constraint that makes the cron safe to run repeatedly.
            sa.UniqueConstraint("fee_id", "rule_id", name="uq_fee_reminder_once"),
        )
        op.create_index("ix_fee_reminder_logs_fee_id", "fee_reminder_logs", ["fee_id"])
        op.create_index("ix_fee_reminder_logs_rule_id", "fee_reminder_logs", ["rule_id"])
        op.create_index("ix_fee_reminder_logs_student_id", "fee_reminder_logs", ["student_id"])
        op.create_index("ix_fee_reminder_logs_status", "fee_reminder_logs", ["status"])
        op.create_index("ix_fee_reminder_logs_sent_on", "fee_reminder_logs", ["sent_on"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # Logs reference rules, so they go first.
    for table in ("fee_reminder_logs", "fee_reminder_rules"):
        if table in tables:
            op.drop_table(table)
